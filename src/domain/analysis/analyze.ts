/**
 * 栄養不足判定(§5)
 *
 * - 対象期間: 今日を除く直近 7 日
 * - 記録日: 「記録完了」を押した日、または 3 食区分以上に記録がある日
 * - 記録日 < 5 なら保留
 * - 平均 = 記録日の合計 / 記録日数(未記録日を 0 として平均しない)
 * - 成分ごとのカバレッジ(エネルギー重み) < 0.8 は「データ不足で判定不可」
 * - カバレッジ 0.8 以上 1 未満は、データのない分をエネルギー比で補った平均で判定する
 * - 判定は食事摂取基準(2025年版)の指標の種類(EAR/RDA・AI・DG)ごとに分ける
 */
import { type DriRow, type PersonForDri, driFor } from "@/domain/dri/dri";
import { type NutrientMap, valueOf } from "@/domain/nutrients/types";

export const MIN_RECORDED_DAYS = 5;
export const WINDOW_DAYS = 7;
export const COVERAGE_THRESHOLD = 0.8;
export const MEAL_TYPES_FOR_RECORDED_DAY = 3;

/** 判定対象(§5.2)。指標の種類はデータ(dri-2025.json)から決まる */
export const ANALYSIS_NUTRIENTS = [
  "PROT-",
  "VITA_RAE",
  "THIA",
  "RIBF",
  "NE",
  "VITB6A",
  "VITB12",
  "FOL",
  "VITC",
  "CA",
  "MG",
  "FE",
  "ZN",
  "VITD",
  "TOCPHA",
  "VITK",
  "K",
  "FIB-",
  "NACL_EQ",
] as const;

export interface AnalysisItem {
  energyKcal: number | null;
  grams: number | null;
  nutrients: NutrientMap;
}

export interface AnalysisDay {
  /** YYYY-MM-DD */
  date: string;
  items: AnalysisItem[];
  /** 記録がある食事区分の数 */
  mealTypeCount: number;
  markedComplete: boolean;
}

export interface AnalysisPerson extends PersonForDri {
  lifeStage: "none" | "pregnant" | "lactating";
}

export type Verdict =
  | "deficient" // 不足傾向(EAR 未満)
  | "slightly_low" // やや少なめ(EAR 以上 RDA 未満)
  | "adequate" // 基準を満たしている
  | "below_ai" // 目安量を下回っている(不足とは判断できない)
  | "below_dg" // 目標量に届いていない
  | "above_dg" // 目標量を超えている
  | "insufficient_data"; // データ不足で判定不可

export type IndicatorKind = "ear_rda" | "ai" | "dg_lower" | "dg_upper";

export interface NutrientResult {
  code: string;
  kind: IndicatorKind;
  /** 1日平均(データのない食品の分をエネルギー比で補った推定値) */
  average: number;
  /** データのある食品だけの 1 日平均(補正前) */
  knownAverage: number;
  coverage: number;
  verdict: Verdict;
  reference: {
    ear: number | null;
    rda: number | null;
    ai: number | null;
    dgLower: number | null;
    dgUpper: number | null;
  };
  /** RDA(または AI・DG下限)までの差。足りている場合 0 */
  gap: number;
  sourceRef: string;
}

export type AnalysisResult =
  | { status: "excluded"; reason: "under18" | "pregnant" | "lactating" }
  | {
      status: "pending";
      recordedDays: number;
      requiredDays: number;
      window: { from: string; to: string };
    }
  | {
      status: "ok";
      recordedDays: number;
      window: { from: string; to: string };
      nutrients: NutrientResult[];
    };

function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function isRecordedDay(day: AnalysisDay): boolean {
  return day.markedComplete || day.mealTypeCount >= MEAL_TYPES_FOR_RECORDED_DAY;
}

/** 成分 code のカバレッジ: その成分が既知の項目が摂取エネルギーに占める割合 */
export function coverage(items: AnalysisItem[], code: string): number {
  const energyKnown = items.filter((i) => i.energyKcal !== null && i.energyKcal > 0);
  const useEnergy = energyKnown.length === items.length && energyKnown.length > 0;
  const weight = (i: AnalysisItem) => (useEnergy ? (i.energyKcal ?? 0) : (i.energyKcal ?? i.grams ?? 0));
  const total = items.reduce((s, i) => s + weight(i), 0);
  if (total <= 0)
    return items.length === 0 ? 0 : items.filter((i) => valueOf(i.nutrients, code) !== null).length / items.length;
  const known = items.filter((i) => valueOf(i.nutrients, code) !== null).reduce((s, i) => s + weight(i), 0);
  return known / total;
}

export function judge(
  code: string,
  average: number,
  cov: number,
  dri: DriRow,
): Pick<NutrientResult, "kind" | "verdict" | "gap"> {
  const kind: IndicatorKind =
    dri.ear !== null && dri.rda !== null && code !== "NACL_EQ"
      ? "ear_rda"
      : dri.ai !== null
        ? "ai"
        : dri.dgUpper !== null
          ? "dg_upper"
          : "dg_lower";

  if (cov < COVERAGE_THRESHOLD) return { kind, verdict: "insufficient_data", gap: 0 };

  switch (kind) {
    case "ear_rda": {
      const { ear, rda } = dri as { ear: number; rda: number };
      if (average < ear) return { kind, verdict: "deficient", gap: rda - average };
      if (average < rda) return { kind, verdict: "slightly_low", gap: rda - average };
      return { kind, verdict: "adequate", gap: 0 };
    }
    case "ai": {
      const ai = dri.ai as number;
      return average >= ai ? { kind, verdict: "adequate", gap: 0 } : { kind, verdict: "below_ai", gap: ai - average };
    }
    case "dg_upper": {
      const up = dri.dgUpper as number;
      return average > up ? { kind, verdict: "above_dg", gap: 0 } : { kind, verdict: "adequate", gap: 0 };
    }
    case "dg_lower": {
      const low = dri.dgLower as number;
      return average >= low ? { kind, verdict: "adequate", gap: 0 } : { kind, verdict: "below_dg", gap: low - average };
    }
  }
}

/**
 * today("YYYY-MM-DD")を除く直近 windowDays 日を分析する。
 * days には対象期間外の日が含まれていてもよい(無視する)。
 */
export function analyzeWindow(
  person: AnalysisPerson,
  days: AnalysisDay[],
  endExclusive: string,
  windowDays = WINDOW_DAYS,
): AnalysisResult {
  if (person.lifeStage === "pregnant" || person.lifeStage === "lactating")
    return { status: "excluded", reason: person.lifeStage };
  if (person.age < 18) return { status: "excluded", reason: "under18" };

  const from = addDays(endExclusive, -windowDays);
  const to = addDays(endExclusive, -1);
  const inWindow = days.filter((d) => d.date >= from && d.date <= to && isRecordedDay(d));
  const recordedDays = inWindow.length;
  if (recordedDays < MIN_RECORDED_DAYS)
    return { status: "pending", recordedDays, requiredDays: MIN_RECORDED_DAYS, window: { from, to } };

  const items = inWindow.flatMap((d) => d.items);
  const nutrients: NutrientResult[] = [];
  for (const code of ANALYSIS_NUTRIENTS) {
    const dri = driFor(code, person);
    if (!dri) continue;
    const sum = items.reduce((s, i) => s + (valueOf(i.nutrients, code) ?? 0), 0);
    const knownAverage = sum / recordedDays;
    const cov = coverage(items, code);
    // データのない食品(カバレッジの残り)も、データのある食品と同じエネルギー当たりの量を含むとみなして補う。
    // 不明分を 0 として平均すると、実際より少なく見積もり「不足」に偏るため
    const average = cov >= COVERAGE_THRESHOLD && cov > 0 ? knownAverage / cov : knownAverage;
    const j = judge(code, average, cov, dri);
    nutrients.push({
      code,
      ...j,
      average,
      knownAverage,
      coverage: cov,
      reference: { ear: dri.ear, rda: dri.rda, ai: dri.ai, dgLower: dri.dgLower, dgUpper: dri.dgUpper },
      sourceRef: dri.sourceRef,
    });
  }
  return { status: "ok", recordedDays, window: { from, to }, nutrients };
}

export interface TrendResult {
  /** 判定できた週の数(記録日数ゲートを満たした週) */
  evaluatedWeeks: number;
  /** 栄養素ごとの「不足傾向・やや少なめ」の週数 */
  lowWeeks: Record<string, number>;
}

/** 長期傾向: 直近 28 日を 7 日ごとに区切って同じ判定を行う(§5.3) */
export function analyzeTrend(person: AnalysisPerson, days: AnalysisDay[], endExclusive: string): TrendResult {
  const lowWeeks: Record<string, number> = {};
  let evaluatedWeeks = 0;
  for (let w = 0; w < 4; w++) {
    const end = addDays(endExclusive, -7 * w);
    const r = analyzeWindow(person, days, end);
    if (r.status !== "ok") continue;
    evaluatedWeeks += 1;
    for (const n of r.nutrients) {
      if (n.verdict === "deficient" || n.verdict === "slightly_low") lowWeeks[n.code] = (lowWeeks[n.code] ?? 0) + 1;
    }
  }
  return { evaluatedWeeks, lowWeeks };
}

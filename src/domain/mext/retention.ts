/**
 * 調理による栄養素の残存率(後備経路の補正)
 *
 * 成分表に調理後データがない食材は生の成分値で計算するため、ゆで・煮るなどで溶け出たり
 * 壊れたりするビタミン・ミネラルを多く見積もってしまう。成分表の「生 → 調理後」の対応
 * (表12 の重量変化率つき)から、USDA と同じ定義の残存率(true retention)を求める。
 *
 *   残存率 = 調理後の含量 × 重量変化率 / 100 ÷ 生の含量
 *
 * 調理法 × 食品群 × 成分ごとの中央値を使い、100% を上限にする(調理で増えることはない)。
 */
import { type CookingMethodCode, median } from "./cooking";

/** 残存率で補正する成分(ビタミン・ミネラル)。ナトリウムは調味の塩と区別できないので除く */
export const RETENTION_CODES = [
  "K",
  "CA",
  "MG",
  "P",
  "FE",
  "ZN",
  "CU",
  "MN",
  "ID",
  "SE",
  "CR",
  "MO",
  "RETOL",
  "CARTA",
  "CARTB",
  "CRYPXB",
  "CARTBEQ",
  "VITA_RAE",
  "VITD",
  "TOCPHA",
  "TOCPHB",
  "TOCPHG",
  "TOCPHD",
  "VITK",
  "THIA",
  "RIBF",
  "NIA",
  "NE",
  "VITB6A",
  "VITB12",
  "FOL",
  "PANTAC",
  "BIOT",
  "VITC",
] as const;

/** 衣が付く調理は衣の成分が加わり、残存率が 100% を超えるので補正しない */
export const RETENTION_EXCLUDED_METHODS: ReadonlySet<string> = new Set(["deep_fry", "tempura", "fry"]);

/** 1 つの区分で中央値を採用するのに必要な対応の数 */
export const RETENTION_MIN_SAMPLES = 5;

export interface RetentionPair {
  method: CookingMethodCode;
  group: string;
  weightChangeRate: number;
  /** 生・調理後の可食部 100 g あたりの値(微量・不明は null) */
  raw: Partial<Record<string, number | null>>;
  cooked: Partial<Record<string, number | null>>;
}

export interface RetentionEntry {
  cookingMethodCode: CookingMethodCode;
  /** 食品群(2 桁)。"*" は全食品群 */
  foodCategory: string;
  retention: Record<string, number>;
  sampleSize: Record<string, number>;
}

/** 対応する生・調理後の値から、調理法 × 食品群(と全食品群)の残存率の中央値を求める */
export function computeRetentionFactors(pairs: RetentionPair[]): RetentionEntry[] {
  const acc = new Map<string, Map<string, number[]>>();
  const push = (key: string, code: string, r: number) => {
    const byCode = acc.get(key) ?? new Map<string, number[]>();
    byCode.set(code, [...(byCode.get(code) ?? []), r]);
    acc.set(key, byCode);
  };
  for (const p of pairs) {
    if (RETENTION_EXCLUDED_METHODS.has(p.method) || !(p.weightChangeRate > 0)) continue;
    for (const code of RETENTION_CODES) {
      const raw = p.raw[code];
      const cooked = p.cooked[code];
      if (raw == null || cooked == null || raw <= 0) continue;
      const r = (cooked * p.weightChangeRate) / 100 / raw;
      push(`${p.method}|${p.group}`, code, r);
      push(`${p.method}|*`, code, r);
    }
  }
  const entries: RetentionEntry[] = [];
  for (const [key, byCode] of acc) {
    const [method, group] = key.split("|");
    const retention: Record<string, number> = {};
    const sampleSize: Record<string, number> = {};
    for (const [code, rs] of byCode) {
      if (rs.length < RETENTION_MIN_SAMPLES) continue;
      retention[code] = Math.round(Math.min(1, median(rs)!) * 100) / 100;
      sampleSize[code] = rs.length;
    }
    if (Object.keys(retention).length) {
      entries.push({ cookingMethodCode: method as CookingMethodCode, foodCategory: group, retention, sampleSize });
    }
  }
  return entries.sort(
    (a, b) => a.cookingMethodCode.localeCompare(b.cookingMethodCode) || a.foodCategory.localeCompare(b.foodCategory),
  );
}

export interface RetentionData {
  /** 成分ごとの残存率(0〜1) */
  factors: Record<string, number>;
  /** 計算の内訳に出す根拠 */
  basis: string;
}

/** 調理法と食品群に合う残存率。食品群の値がない成分は全食品群の値を使う */
export function resolveRetention(entries: RetentionEntry[], method: string, group: string): RetentionData | null {
  if (RETENTION_EXCLUDED_METHODS.has(method)) return null;
  const own = entries.find((e) => e.cookingMethodCode === method && e.foodCategory === group);
  const all = entries.find((e) => e.cookingMethodCode === method && e.foodCategory === "*");
  const factors: Record<string, number> = { ...all?.retention, ...own?.retention };
  if (!Object.keys(factors).length) return null;
  const basis = own
    ? `成分表の調理前後の値から算出した食品群${group}の中央値(不足分は全食品群の中央値)`
    : "成分表の調理前後の値から算出した全食品群の中央値";
  return { factors, basis };
}

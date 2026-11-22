import { describe, expect, it } from "vitest";

import { driFor } from "@/domain/dri/dri";

import {
  type AnalysisDay,
  type AnalysisItem,
  type AnalysisPerson,
  COVERAGE_THRESHOLD,
  analyzeTrend,
  analyzeWindow,
  coverage,
  isRecordedDay,
  judge,
} from "./analyze";

const person: AnalysisPerson = { age: 32, sex: "female", lifeStage: "none", menstruation: false };
const TODAY = "2026-11-22";

function day(date: string, items: AnalysisItem[], opts: Partial<AnalysisDay> = {}): AnalysisDay {
  return { date, items, mealTypeCount: 3, markedComplete: false, ...opts };
}
const item = (energyKcal: number | null, nutrients: AnalysisItem["nutrients"]): AnalysisItem => ({
  energyKcal,
  grams: 100,
  nutrients,
});
const dates = (n: number) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(`${TODAY}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (i + 1));
    return d.toISOString().slice(0, 10);
  });

describe("記録日数ゲート(§5.3)", () => {
  it("記録日が 5 日未満なら保留し、必要日数を返す", () => {
    const days = dates(4).map((d) => day(d, [item(1800, { "PROT-": 60 })]));
    const r = analyzeWindow(person, days, TODAY);
    expect(r).toMatchObject({ status: "pending", recordedDays: 4, requiredDays: 5 });
  });

  it("今日の記録は対象期間に含めない", () => {
    const days = [...dates(4), TODAY].map((d) => day(d, [item(1800, { "PROT-": 60 })]));
    expect(analyzeWindow(person, days, TODAY).status).toBe("pending");
  });

  it("3 食区分以上、または「記録完了」の日を記録日とする", () => {
    expect(isRecordedDay(day(TODAY, [], { mealTypeCount: 2 }))).toBe(false);
    expect(isRecordedDay(day(TODAY, [], { mealTypeCount: 2, markedComplete: true }))).toBe(true);
    expect(isRecordedDay(day(TODAY, [], { mealTypeCount: 3 }))).toBe(true);
  });

  it("平均は記録日数で割る(未記録日を 0 として平均しない)", () => {
    const days = dates(5).map((d) => day(d, [item(1800, { "PROT-": 70 })]));
    // 7 日中 5 日だけ記録 → 平均 70(350/7=50 ではない)
    const r = analyzeWindow(person, days, TODAY);
    if (r.status !== "ok") throw new Error();
    expect(r.recordedDays).toBe(5);
    expect(r.nutrients.find((n) => n.code === "PROT-")?.average).toBe(70);
  });
});

describe("データ欠損の扱い(§5.4)", () => {
  it("カバレッジはエネルギーで重み付けする", () => {
    const items = [item(900, { CA: 300 }), item(100, { CA: null })];
    expect(coverage(items, "CA")).toBeCloseTo(0.9);
    // 少量の不明食品(お茶等)では判定不能にならない
    expect(coverage(items, "CA")).toBeGreaterThanOrEqual(COVERAGE_THRESHOLD);
  });

  it("カバレッジ 0.8 未満は「データ不足で判定不可」(不足と判定しない)", () => {
    const days = dates(5).map((d) =>
      day(d, [item(700, { "PROT-": 20, CA: null }), item(1100, { "PROT-": 40, CA: 100 })]),
    );
    const r = analyzeWindow(person, days, TODAY);
    if (r.status !== "ok") throw new Error();
    const ca = r.nutrients.find((n) => n.code === "CA")!;
    expect(ca.coverage).toBeCloseTo(1100 / 1800);
    expect(ca.verdict).toBe("insufficient_data");
    expect(r.nutrients.find((n) => n.code === "PROT-")?.verdict).not.toBe("insufficient_data");
  });

  it("データのない食品の分は、エネルギー比で補って平均する(不明分を 0 にしない)", () => {
    // 1 日: カルシウムが分かる食品 900 kcal(300 mg)+ 分からない食品 100 kcal
    const days = dates(5).map((d) => day(d, [item(900, { CA: 300 }), item(100, { CA: null })]));
    const r = analyzeWindow(person, days, TODAY);
    if (r.status !== "ok") throw new Error();
    const ca = r.nutrients.find((n) => n.code === "CA")!;
    expect(ca.knownAverage).toBe(300);
    expect(ca.coverage).toBeCloseTo(0.9);
    expect(ca.average).toBeCloseTo(300 / 0.9);
  });

  it("閾値ちょうど(0.8)は判定する", () => {
    const dri = driFor("CA", person)!;
    expect(judge("CA", 0, 0.8, dri).verdict).toBe("deficient");
    expect(judge("CA", 0, 0.7999, dri).verdict).toBe("insufficient_data");
  });
});

describe("判定ルール(§5.5)", () => {
  const ca = driFor("CA", person)!; // 女性 30〜49: EAR 550 / RDA 650
  it.each([
    [500, "deficient"],
    [550, "slightly_low"],
    [649, "slightly_low"],
    [650, "adequate"],
  ] as const)("カルシウム 平均 %d mg → %s", (avg, verdict) => {
    expect(judge("CA", avg, 1, ca).verdict).toBe(verdict);
  });

  it("目安量(AI)の栄養素は、下回っても「不足」とは判定しない", () => {
    const vd = driFor("VITD", person)!;
    expect(judge("VITD", 3, 1, vd)).toMatchObject({ kind: "ai", verdict: "below_ai" });
    expect(judge("VITD", 9, 1, vd).verdict).toBe("adequate");
  });

  it("食塩は目標量の上限、食物繊維は下限と比べる", () => {
    expect(judge("NACL_EQ", 9, 1, driFor("NACL_EQ", person)!)).toMatchObject({ kind: "dg_upper", verdict: "above_dg" });
    expect(judge("FIB-", 12, 1, driFor("FIB-", person)!)).toMatchObject({ kind: "dg_lower", verdict: "below_dg" });
  });

  it("不足量(gap)は推奨量までの差", () => {
    expect(judge("CA", 500, 1, ca).gap).toBe(150);
  });
});

describe("対象外(§5.6)", () => {
  it.each([
    [{ ...person, lifeStage: "pregnant" as const }, "pregnant"],
    [{ ...person, lifeStage: "lactating" as const }, "lactating"],
    [{ ...person, age: 17 }, "under18"],
  ])("%o は判定しない", (p, reason) => {
    expect(analyzeWindow(p, [], TODAY)).toEqual({ status: "excluded", reason });
  });
});

describe("長期傾向(直近4週)", () => {
  it("記録日数ゲートを満たした週だけを数える", () => {
    const all = dates(28);
    // 直近 2 週は毎日記録(カルシウム少なめ)、3〜4 週目は記録なし
    const days = all.slice(0, 14).map((d) => day(d, [item(1800, { CA: 400 })]));
    const t = analyzeTrend(person, days, TODAY);
    expect(t.evaluatedWeeks).toBe(2);
    expect(t.lowWeeks.CA).toBe(2);
  });
});

import { describe, expect, it } from "vitest";

import data from "../../../data/mext/retention-factors.json";
import { type RetentionEntry, type RetentionPair, computeRetentionFactors, resolveRetention } from "./retention";

const pair = (method: RetentionPair["method"], group: string, raw: number, cooked: number, wcr = 100) => ({
  method,
  group,
  weightChangeRate: wcr,
  raw: { VITC: raw },
  cooked: { VITC: cooked },
});

describe("調理による残存率の算出", () => {
  it("残存率 = 調理後の含量 × 重量変化率 ÷ 生の含量 の中央値", () => {
    // ゆでて重さが 90% になり、100 g あたり 20 → 10 mg: 10 × 0.9 / 20 = 0.45
    const pairs = [0, 1, 2, 3, 4].map(() => pair("boil", "06", 20, 10, 90));
    const [all, veg] = computeRetentionFactors(pairs);
    expect(veg).toMatchObject({ foodCategory: "06", retention: { VITC: 0.45 }, sampleSize: { VITC: 5 } });
    expect(all).toMatchObject({ foodCategory: "*", retention: { VITC: 0.45 } });
  });

  it("対応が 5 件に満たない区分は使わず、100% を超える値は 100% にする", () => {
    const pairs = [
      ...[0, 1, 2, 3].map(() => pair("grill", "11", 10, 8)),
      ...[0, 1, 2, 3, 4].map(() => pair("steam", "02", 10, 12)),
    ];
    const entries = computeRetentionFactors(pairs);
    expect(entries.find((e) => e.cookingMethodCode === "grill")).toBeUndefined();
    expect(entries.find((e) => e.cookingMethodCode === "steam" && e.foodCategory === "02")?.retention.VITC).toBe(1);
  });

  it("衣の付く揚げ物は算出しない", () => {
    const pairs = [0, 1, 2, 3, 4].map(() => pair("tempura", "06", 10, 30));
    expect(computeRetentionFactors(pairs)).toEqual([]);
  });

  it("食品群の値がない成分は全食品群の値で補う", () => {
    const entries: RetentionEntry[] = [
      { cookingMethodCode: "boil", foodCategory: "*", retention: { VITC: 0.4, K: 0.6 }, sampleSize: {} },
      { cookingMethodCode: "boil", foodCategory: "06", retention: { VITC: 0.5 }, sampleSize: {} },
    ];
    expect(resolveRetention(entries, "boil", "06")?.factors).toEqual({ VITC: 0.5, K: 0.6 });
    expect(resolveRetention(entries, "boil", "11")?.basis).toContain("全食品群");
    expect(resolveRetention(entries, "fry", "06")).toBeNull();
  });
});

describe("同梱の残存率データ", () => {
  const entries = data.entries as RetentionEntry[];
  it("すべて 0〜100% の範囲", () => {
    for (const e of entries) for (const v of Object.values(e.retention)) expect(v).toBeGreaterThanOrEqual(0);
    for (const e of entries) for (const v of Object.values(e.retention)) expect(v).toBeLessThanOrEqual(1);
  });
  it("野菜をゆでるとビタミン C は半分程度、カルシウムはほぼ残る", () => {
    const veg = resolveRetention(entries, "boil", "06")!.factors;
    expect(veg.VITC).toBeGreaterThan(0.3);
    expect(veg.VITC).toBeLessThan(0.6);
    expect(veg.CA).toBeGreaterThan(0.9);
  });
});

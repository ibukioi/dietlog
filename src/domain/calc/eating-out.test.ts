import { describe, expect, it } from "vitest";

import { allocateGrams, buildEstimateSpecs, type EstimateRow, isServedAsIs } from "./eating-out";

const row = (foodNo: string, p: Partial<EstimateRow> = {}): EstimateRow => ({
  foodNo,
  share: "main",
  grams: null,
  servedAsIs: false,
  ...p,
});

describe("allocateGrams", () => {
  it("splits the portion by メイン 4 : たっぷり 2 : 少し 1", () => {
    const g = allocateGrams({
      dishType: "single", // 普通 150 g
      size: "regular",
      rows: [row("a"), row("b", { share: "plenty" }), row("c", { share: "little" })],
    });
    expect(g).toEqual([85.7, 42.9, 21.4]);
    expect(g.reduce((s, x) => s + x, 0)).toBeCloseTo(150, 0);
  });

  it("keeps rows given in grams out of the split", () => {
    const g = allocateGrams({
      dishType: "donburi", // 具 普通 170 g
      size: "regular",
      rows: [row("rice", { grams: 250, servedAsIs: true }), row("pork"), row("onion", { share: "plenty" })],
    });
    expect(g[0]).toBe(250);
    expect(g[1] + g[2]).toBeCloseTo(170, 0);
  });

  it("scales with the portion size", () => {
    const small = allocateGrams({ dishType: "teishoku", size: "small", rows: [row("a")] });
    const large = allocateGrams({ dishType: "teishoku", size: "large", rows: [row("a")] });
    expect(small).toEqual([120]);
    expect(large).toEqual([250]);
  });
});

describe("buildEstimateSpecs", () => {
  it("treats split weights as cooked weights and uses one method for the dish", () => {
    const specs = buildEstimateSpecs({
      dishType: "single",
      size: "regular",
      method: "grill",
      rows: [row("a"), row("b")],
      addSeasoning: false,
    });
    expect(specs.every((s) => s.weightBasis === "cooked" && s.method === "grill")).toBe(true);
  });

  it("does not cook rice or other foods that are already served as is", () => {
    const [rice] = buildEstimateSpecs({
      dishType: "donburi",
      size: "regular",
      method: "simmer",
      rows: [row("01088", { grams: 250, servedAsIs: true }), row("pork")],
      addSeasoning: false,
    });
    expect(rice).toMatchObject({ amount: 250, weightBasis: "raw", method: "raw" });
  });

  it("adds salt by dish type and extra oil only for stir-fries", () => {
    const base = { dishType: "teishoku" as const, size: "regular" as const, rows: [row("a")], addSeasoning: true };
    const grilled = buildEstimateSpecs({ ...base, method: "grill" });
    expect(grilled.filter((s) => s.role === "seasoning").map((s) => [s.foodNo, s.amount])).toEqual([["17012", 2]]);

    const sauteed = buildEstimateSpecs({ ...base, method: "saute", size: "large" });
    expect(sauteed.filter((s) => s.role === "seasoning").map((s) => [s.foodNo, s.amount])).toEqual([
      ["17012", 2.7],
      ["14006", 6.8],
    ]);
  });

  it("adds no seasoning when there are no ingredients", () => {
    expect(
      buildEstimateSpecs({ dishType: "side", size: "regular", method: "raw", rows: [], addSeasoning: true }),
    ).toEqual([]);
  });
});

describe("isServedAsIs", () => {
  it("recognises cooked rice and prepared foods", () => {
    expect(isServedAsIs({ nameDisplay: "こめ 水稲めし 精白米 うるち米", isCooked: false, isDish: false })).toBe(true);
    expect(isServedAsIs({ nameDisplay: "ぎょうざ", isCooked: false, isDish: true })).toBe(true);
    expect(isServedAsIs({ nameDisplay: "ぶた ロース 脂身つき 生", isCooked: false, isDish: false })).toBe(false);
  });
});

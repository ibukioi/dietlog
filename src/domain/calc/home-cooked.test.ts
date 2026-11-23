import { describe, expect, it } from "vitest";

import { food } from "../../../tests/fixtures/mext";
import { type IngredientInput, calcRecipe, toGrams, toRawEdibleGrams } from "./home-cooked";

const oil = food("14006"); // 調合油
const opts = { servings: 1, defaultOil: oil };

const spinachRaw = food("06267");
const spinachBoiled = food("06268");
const spinachSaute = food("06359");

describe("重量の入力正規化(§4.2 (0))", () => {
  it("廃棄部込み(購入量)は廃棄率を除く: 式(c5)の逆", () => {
    // ほうれんそう 廃棄率 10% → 200 g 購入 = 可食部 180 g
    expect(toRawEdibleGrams(200, "purchased", 10, 100)).toBe(180);
  });
  it("調理後に量った重量は重量変化率で生重量に戻す", () => {
    // ゆで 70% → ゆで上がり 70 g = 生 100 g
    expect(toRawEdibleGrams(70, "cooked", null, 70)).toBeCloseTo(100);
  });
  it("大さじ・小さじは成分表備考の密度で換算する", () => {
    // こいくちしょうゆ 100 mL = 118.1 g → 大さじ1(15 mL) = 17.715 g
    expect(toGrams(1, "tbsp", 1.181).grams).toBeCloseTo(17.715);
    expect(toGrams(2, "tsp", 1.181).grams).toBeCloseTo(11.81);
    expect(toGrams(10, "ml", null)).toEqual({ grams: 10, densityAssumed: true });
  });
});

describe("① 調理後データがある場合は成分表の式(c4)で計算する", () => {
  it("ほうれんそう生 100 g をゆでる → 06268「ゆで」× 70 g", () => {
    const r = calcRecipe(
      [
        {
          role: "ingredient",
          food: spinachRaw,
          amount: 100,
          unit: "g",
          weightBasis: "raw",
          method: "boil",
          variant: { cookedFood: spinachBoiled, weightChangeRate: 70, includesOil: false },
        },
      ],
      opts,
    );
    // ゆで 23 kcal/100 g × 70 g = 16.1 kcal
    expect(r.total.ENERC_KCAL).toBeCloseTo(16.1, 5);
    expect(r.lines[0].path).toBe("cooked_data");
    expect(r.lines[0].cookedGrams).toBeCloseTo(70);
    expect(r.cookedWeightG).toBeCloseTo(70);
  });

  it("油いための調理後データは油を含むので、入力した油を二重に加算しない", () => {
    const r = calcRecipe(
      [
        {
          role: "ingredient",
          food: spinachRaw,
          amount: 100,
          unit: "g",
          weightBasis: "raw",
          method: "saute",
          variant: { cookedFood: spinachSaute, weightChangeRate: 58, includesOil: true },
        },
        { role: "oil", food: oil, amount: 5, unit: "g", weightBasis: "raw", method: "raw" },
      ],
      opts,
    );
    // 油いため 91 kcal/100 g × 58 g = 52.78 kcal(油の加算なし)
    expect(r.total.ENERC_KCAL).toBeCloseTo(52.78, 2);
    expect(r.oil[0].absorbedG).toBe(0);
    expect(r.notes.join()).toContain("調理後データに含まれている");
  });
});

describe("② 調理後データがない場合は生の成分値 + 吸油量(後備)", () => {
  const chicken = food("11220"); // むね 皮なし 生 105 kcal
  const base: IngredientInput = {
    role: "ingredient",
    food: chicken,
    amount: 100,
    unit: "g",
    weightBasis: "raw",
    method: "saute",
    variant: null,
    coefficient: { weightChangeRate: 86, oilAbsorptionPct: 3.6, basis: "テスト" },
  };

  it("油の指定がなければ吸油量を調合油として加算する", () => {
    const r = calcRecipe([base], opts);
    // 105 + 調合油 886 kcal × 3.6 g / 100 = 105 + 31.896
    expect(r.total.ENERC_KCAL).toBeCloseTo(136.896, 3);
    expect(r.oil[0]).toMatchObject({ source: "default", absorbedG: 3.6 });
    expect(r.lines[0].path).toBe("fallback");
  });

  it("使用油が吸油量より多いときは吸着分だけを加算する: min(O, W×a/100)", () => {
    const r = calcRecipe(
      [base, { role: "oil", food: oil, amount: 10, unit: "g", weightBasis: "raw", method: "raw" }],
      opts,
    );
    expect(r.oil[0].absorbedG).toBeCloseTo(3.6);
    expect(r.total.ENERC_KCAL).toBeCloseTo(136.896, 3);
  });

  it("「全部摂った」を指定すると使用油を全量加算する", () => {
    const r = calcRecipe(
      [base, { role: "oil", food: oil, amount: 10, unit: "g", weightBasis: "raw", method: "raw", consumeAll: true }],
      opts,
    );
    expect(r.total.ENERC_KCAL).toBeCloseTo(105 + 88.6, 3);
  });

  it("使用油が吸油量より少なければ使用量が上限になる", () => {
    const r = calcRecipe(
      [base, { role: "oil", food: oil, amount: 2, unit: "g", weightBasis: "raw", method: "raw" }],
      opts,
    );
    expect(r.oil[0].absorbedG).toBe(2);
  });
});

describe("汁ごと食べる(味噌汁・スープ)", () => {
  it("調理後データがあっても使わず、調理前の成分値で計算する(溶け出た成分も摂るため)", () => {
    const r = calcRecipe(
      [
        {
          role: "ingredient",
          food: spinachRaw,
          amount: 100,
          unit: "g",
          weightBasis: "raw",
          method: "soup",
          // 呼び出し側が誤って調理後データを渡しても使わない
          variant: { cookedFood: spinachBoiled, weightChangeRate: 70, includesOil: false },
        },
      ],
      opts,
    );
    // 生 18 kcal/100 g × 100 g(ゆでの 16.1 kcal ではない)
    expect(r.total.ENERC_KCAL).toBeCloseTo(18);
    // カリウムも生の値のまま(ゆで汁に溶け出た分を失わない)
    expect(r.total.K).toBeCloseTo(spinachRaw.nutrients.K!);
    expect(r.lines[0].path).toBe("soup");
    expect(r.lines[0].notes.join()).toContain("汁ごと");
  });
});

describe("③ 調味料と 1 人前", () => {
  it("調味料は使用量をそのまま加算し、人数で割る", () => {
    const r = calcRecipe(
      [
        {
          role: "ingredient",
          food: spinachRaw,
          amount: 200,
          unit: "g",
          weightBasis: "raw",
          method: "boil",
          variant: { cookedFood: spinachBoiled, weightChangeRate: 70, includesOil: false },
        },
        { role: "seasoning", food: food("17007"), amount: 1, unit: "tbsp", weightBasis: "raw", method: "raw" },
      ],
      { ...opts, servings: 2 },
    );
    // ゆで 23 × 140/100 = 32.2 kcal、しょうゆ 76 × 17.715/100 = 13.4634 kcal
    expect(r.total.ENERC_KCAL).toBeCloseTo(32.2 + 13.4634, 3);
    expect(r.perServing.ENERC_KCAL).toBeCloseTo((32.2 + 13.4634) / 2, 3);
    // 食塩相当量 しょうゆ 14.5 g/100 g
    expect(r.total.NACL_EQ).toBeCloseTo(0 + 14.5 * 0.17715 + 0 * 1.4, 2);
  });

  it("不明な成分は 0 にせず null のまま伝播する", () => {
    const r = calcRecipe(
      [
        { role: "ingredient", food: food("06153"), amount: 100, unit: "g", weightBasis: "raw", method: "raw" },
        { role: "seasoning", food: food("17012"), amount: 1, unit: "g", weightBasis: "raw", method: "raw" },
      ],
      opts,
    );
    // 食塩のビタミンE(α-トコフェロール)は成分表で「-」(未測定)だが、食塩は 0 kcal なので
    // 料理全体のビタミンE は既知値の合計とする(不明の割合 5% 以下)
    expect(food("17012").nutrients.TOCPHA).toBeNull();
    expect(r.total.TOCPHA).toBeCloseTo(food("06153").nutrients.TOCPHA!);
    expect(r.total.ENERC_KCAL).toBeCloseTo(33);

    // 調合油(886 kcal/100 g)の「利用可能炭水化物(単糖当量)」は未測定。
    // 油のエネルギーが料理の大半を占めるので、料理全体でも不明(0 として足さない)
    const r2 = calcRecipe(
      [
        { role: "ingredient", food: food("06153"), amount: 100, unit: "g", weightBasis: "raw", method: "raw" },
        { role: "oil", food: oil, amount: 10, unit: "g", weightBasis: "raw", method: "raw", consumeAll: true },
      ],
      opts,
    );
    expect(oil.nutrients.CHOAVLM).toBeNull();
    expect(r2.total.CHOAVLM).toBeNull();
  });

  it("servings が 0 以下ならエラー", () => {
    expect(() => calcRecipe([], { ...opts, servings: 0 })).toThrow();
  });
});

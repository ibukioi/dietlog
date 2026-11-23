/**
 * 自炊のカロリー・栄養計算(§4)
 *
 * ① 調理後データがある食材は成分表の式(c4)で計算(優先)
 *      摂取量 = N_cooked × (W_raw × WCR / 100) / 100
 * ② ない食材は生の成分値 + 吸油量(後備)
 *      摂取量 = N_raw × W_raw / 100,  吸油量 = W_raw × a / 100
 * ③ 調味料は使用量(g) をそのまま加算。大さじ・小さじ・ml は密度で g に換算
 *
 * フレームワークに依存しない純粋関数。データの取得は呼び出し側で行う。
 */
import { OIL_METHODS, type CookingMethodCode } from "@/domain/mext/cooking";
import { type NutrientMap, roundMap, scale, valueOf } from "@/domain/nutrients/types";

export interface FoodData {
  foodNo: string;
  name: string;
  groupCode: string;
  refuseRate: number | null;
  densityGPerMl: number | null;
  /** 可食部 100 g あたり */
  nutrients: NutrientMap;
}

export interface CookedVariantData {
  cookedFood: FoodData;
  /** 重量変化率(%) 表12 */
  weightChangeRate: number;
  /** 調理後データに油の吸着が含まれる(油いため・揚げ物等) */
  includesOil: boolean;
}

export interface CoefficientData {
  weightChangeRate: number;
  /** 生重量 100 g あたりの吸油量(g) */
  oilAbsorptionPct: number;
  basis: string;
}

export type AmountUnit = "g" | "ml" | "tbsp" | "tsp";
export type WeightBasis = "raw" | "purchased" | "cooked";

export interface IngredientInput {
  role: "ingredient" | "oil" | "seasoning";
  food: FoodData;
  amount: number;
  unit: AmountUnit;
  weightBasis: WeightBasis;
  method: CookingMethodCode;
  /** 油: 使用量を全量摂取したとみなす */
  consumeAll?: boolean;
  /** 呼び出し側で解決した調理後データ(なければ null) */
  variant?: CookedVariantData | null;
  /** 呼び出し側で解決した後備係数(なければ null) */
  coefficient?: CoefficientData | null;
}

export interface CalcOptions {
  servings: number;
  /** 油の指定がないときに吸油量の計算に使う油(既定: 調合油) */
  defaultOil: FoodData;
}

export type IngredientPath = "raw" | "soup" | "cooked_data" | "fallback";

export interface IngredientTrace {
  role: IngredientInput["role"];
  name: string;
  foodNo: string;
  path: IngredientPath;
  /** 計算に使った食品(調理後データを使った場合はその食品) */
  usedFoodNo: string;
  usedFoodName: string;
  inputGrams: number;
  rawGrams: number;
  cookedGrams: number;
  weightChangeRate: number | null;
  /** 後備で見込んだ吸油量の上限(g) */
  oilCapacityG: number;
  notes: string[];
  nutrients: NutrientMap;
}

export interface OilTrace {
  foodNo: string;
  name: string;
  usedG: number;
  absorbedG: number;
  source: "user" | "default";
  includedInCookedData: boolean;
  nutrients: NutrientMap;
}

export interface RecipeResult {
  total: NutrientMap;
  perServing: NutrientMap;
  servings: number;
  rawWeightG: number;
  cookedWeightG: number;
  lines: IngredientTrace[];
  oil: OilTrace[];
  notes: string[];
}

export const TBSP_ML = 15;
export const TSP_ML = 5;
const DEFAULT_DENSITY = 1;

/** 入力量 → グラム。ml・大さじ・小さじは成分表備考の密度(g/mL)で換算 */
export function toGrams(amount: number, unit: AmountUnit, densityGPerMl: number | null) {
  if (unit === "g") return { grams: amount, densityAssumed: false };
  const ml = unit === "ml" ? amount : unit === "tbsp" ? amount * TBSP_ML : amount * TSP_ML;
  const d = densityGPerMl ?? DEFAULT_DENSITY;
  return { grams: ml * d, densityAssumed: densityGPerMl === null };
}

/** 入力重量 → 調理前の可食部重量 W_raw(§4.2 (0)) */
export function toRawEdibleGrams(
  grams: number,
  basis: WeightBasis,
  refuseRate: number | null,
  weightChangeRate: number,
): number {
  if (basis === "raw") return grams;
  if (basis === "purchased") return (grams * (100 - (refuseRate ?? 0))) / 100;
  return (grams * 100) / weightChangeRate;
}

function per100(n: NutrientMap, grams: number): NutrientMap {
  return scale(n, grams / 100);
}

/** 不明値がエネルギー(不明なら重量)の何割までなら既知値の合計を採用するか */
export const UNKNOWN_SHARE_TOLERANCE = 0.05;

/**
 * 1 品の内訳を合算する。ある成分が不明な食材の割合(エネルギー重み、
 * エネルギーも不明なら重量)が 5% 以下なら既知値の合計、超えたら不明(null)。
 * 例: 味噌汁のだし(ほぼ 0 kcal)に食物繊維の記載がなくても、汁全体は不明にしない。
 */
export function combineComponents(components: Array<{ n: NutrientMap; grams: number }>): NutrientMap {
  const codes = new Set(components.flatMap((c) => Object.keys(c.n)));
  const weightOf = (c: { n: NutrientMap; grams: number }) => {
    const e = valueOf(c.n, "ENERC_KCAL");
    return e !== null ? e : 0;
  };
  const totalEnergy = components.reduce((s, c) => s + weightOf(c), 0);
  const totalGrams = components.reduce((s, c) => s + c.grams, 0);
  const out: NutrientMap = {};
  for (const code of codes) {
    let sum = 0;
    let unknownEnergy = 0;
    let unknownGrams = 0;
    for (const c of components) {
      const v = valueOf(c.n, code);
      if (v === null) {
        unknownEnergy += weightOf(c);
        unknownGrams += c.grams;
      } else sum += v;
    }
    const share =
      totalEnergy > 0
        ? unknownEnergy / totalEnergy
        : totalGrams > 0
          ? unknownGrams / totalGrams
          : unknownGrams > 0
            ? 1
            : 0;
    const anyUnknown = unknownEnergy > 0 || unknownGrams > 0;
    out[code] = !anyUnknown || share <= UNKNOWN_SHARE_TOLERANCE ? sum : null;
  }
  return out;
}

export function calcRecipe(inputs: IngredientInput[], opts: CalcOptions): RecipeResult {
  if (!(opts.servings > 0)) throw new Error("servings must be > 0");
  const lines: IngredientTrace[] = [];
  const notes: string[] = [];
  const components: Array<{ n: NutrientMap; grams: number }> = [];
  const add = (n: NutrientMap, grams: number) => components.push({ n, grams });

  let oilCapacity = 0; // 後備経路で吸着し得る油の量(g)
  let oilMethodWithCookedData = false;
  let rawWeight = 0;
  let cookedWeight = 0;

  const foods = inputs.filter((i) => i.role !== "oil");
  const oils = inputs.filter((i) => i.role === "oil");

  for (const ing of foods) {
    const { grams, densityAssumed } = toGrams(ing.amount, ing.unit, ing.food.densityGPerMl);
    const lineNotes: string[] = [];
    if (densityAssumed && ing.unit !== "g") lineNotes.push("密度の記載がないため 1 mL = 1 g で換算");

    // 汁ごと食べる料理は、溶け出た成分も摂るので調理前の成分値をそのまま使う
    const isSoup = ing.method === "soup" && ing.role === "ingredient";
    const isRaw = ing.method === "raw" || ing.role === "seasoning" || isSoup;
    const variant = isRaw ? null : (ing.variant ?? null);
    const coef = isRaw ? null : (ing.coefficient ?? null);
    const wcr = variant?.weightChangeRate ?? coef?.weightChangeRate ?? 100;
    const basis: WeightBasis = ing.role === "seasoning" ? "raw" : ing.weightBasis;
    const wRaw = toRawEdibleGrams(grams, basis, ing.food.refuseRate, wcr);
    if (basis === "purchased") lineNotes.push(`廃棄率 ${ing.food.refuseRate ?? 0}% を除いた可食部で計算`);
    if (ing.weightBasis === "cooked" && !isRaw) lineNotes.push(`調理後重量を重量変化率 ${wcr}% で生重量に換算`);

    let nutrients: NutrientMap;
    let path: IngredientPath;
    let used = ing.food;
    let capacity = 0;
    let cookedG = wRaw;

    if (isSoup) {
      path = "soup";
      nutrients = per100(ing.food.nutrients, wRaw);
      lineNotes.push(
        "汁に溶け出た成分も汁ごと食べるため、調理前の成分値で計算(成分表の「ゆで」「水煮」は汁を捨てた値)",
      );
    } else if (isRaw) {
      path = "raw";
      nutrients = per100(ing.food.nutrients, wRaw);
    } else if (variant) {
      // ① 調理後データ優先: 成分表 式(c4)
      path = "cooked_data";
      used = variant.cookedFood;
      cookedG = (wRaw * variant.weightChangeRate) / 100;
      nutrients = per100(variant.cookedFood.nutrients, cookedG);
      lineNotes.push(
        `成分表の調理後データ「${variant.cookedFood.name}」を使用(重量変化率 ${variant.weightChangeRate}%)`,
      );
      if (variant.includesOil) {
        oilMethodWithCookedData = true;
        lineNotes.push("調理後データに油の吸着が含まれるため、油は二重に加算しない");
      }
    } else {
      // ② 後備: 生の成分値 + 吸油量
      path = "fallback";
      nutrients = per100(ing.food.nutrients, wRaw);
      cookedG = (wRaw * wcr) / 100;
      if (OIL_METHODS.has(ing.method)) {
        capacity = (wRaw * (coef?.oilAbsorptionPct ?? 0)) / 100;
        oilCapacity += capacity;
      }
      lineNotes.push(
        coef
          ? `調理後データがないため生の成分値で計算(後備係数: ${coef.basis})`
          : "調理後データ・後備係数がないため生の成分値で計算",
      );
    }

    rawWeight += wRaw;
    cookedWeight += ing.role === "seasoning" ? grams : cookedG;
    add(nutrients, ing.role === "seasoning" ? grams : cookedG);
    lines.push({
      role: ing.role,
      name: ing.food.name,
      foodNo: ing.food.foodNo,
      path,
      usedFoodNo: used.foodNo,
      usedFoodName: used.name,
      inputGrams: grams,
      rawGrams: wRaw,
      cookedGrams: cookedG,
      weightChangeRate: path === "raw" || path === "soup" ? null : wcr,
      oilCapacityG: capacity,
      notes: lineNotes,
      nutrients: roundMap(nutrients),
    });
  }

  // 油: 後備経路の食材が吸着する量だけを加算(全量摂取の指定があれば全量)
  const oilTraces: OilTrace[] = [];
  if (oils.length > 0) {
    const usedTotal = oils.reduce((s, o) => s + toGrams(o.amount, o.unit, o.food.densityGPerMl).grams, 0);
    let remainingCapacity = oilCapacity;
    for (const o of oils) {
      const usedG = toGrams(o.amount, o.unit, o.food.densityGPerMl).grams;
      let absorbed: number;
      if (o.consumeAll) {
        absorbed = usedG;
      } else {
        absorbed = Math.min(usedG, remainingCapacity);
        remainingCapacity -= absorbed;
      }
      const n = per100(o.food.nutrients, absorbed);
      add(n, absorbed);
      cookedWeight += absorbed;
      oilTraces.push({
        foodNo: o.food.foodNo,
        name: o.food.name,
        usedG,
        absorbedG: absorbed,
        source: "user",
        includedInCookedData: oilMethodWithCookedData && !o.consumeAll && absorbed < usedG,
        nutrients: roundMap(n),
      });
    }
    if (usedTotal > 0 && oilCapacity === 0 && oilMethodWithCookedData) {
      notes.push("炒め・揚げの油は成分表の調理後データに含まれているため、入力した油は加算していません");
    } else if (oilTraces.some((t) => t.absorbedG < t.usedG)) {
      notes.push("使用した油のうち、食材に吸着したと推定される量だけを加算しています(残りは鍋に残ったとみなします)");
    }
  } else if (oilCapacity > 0) {
    const n = per100(opts.defaultOil.nutrients, oilCapacity);
    add(n, oilCapacity);
    cookedWeight += oilCapacity;
    oilTraces.push({
      foodNo: opts.defaultOil.foodNo,
      name: opts.defaultOil.name,
      usedG: oilCapacity,
      absorbedG: oilCapacity,
      source: "default",
      includedInCookedData: false,
      nutrients: roundMap(n),
    });
    notes.push(`油の指定がないため、吸油量 ${oilCapacity.toFixed(1)} g を${opts.defaultOil.name}として加算しています`);
  }

  const total = combineComponents(components);
  return {
    total: roundMap(total),
    perServing: roundMap(scale(total, 1 / opts.servings)),
    servings: opts.servings,
    rawWeightG: rawWeight,
    cookedWeightG: cookedWeight,
    lines,
    oil: oilTraces,
    notes,
  };
}

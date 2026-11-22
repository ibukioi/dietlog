import "server-only";

import { type AmountUnit, type IngredientInput, type WeightBasis, calcRecipe } from "@/domain/calc/home-cooked";
import type { CookingMethodCode } from "@/domain/mext/cooking";
import { NUTRIENT_CODES } from "@/domain/nutrients/catalog";
import { getFoods, resolveCoefficient, resolveVariant } from "@/server/repositories/mext";

export const DEFAULT_OIL_FOOD_NO = "14006"; // 調合油

export interface IngredientSpec {
  role: "ingredient" | "oil" | "seasoning";
  foodNo: string;
  amount: number;
  unit: AmountUnit;
  weightBasis: WeightBasis;
  method: CookingMethodCode;
  consumeAll?: boolean;
}

/** 入力(食品番号・量・調理法)から DB のデータを解決して計算する */
export async function calculateHomeCooked(specs: IngredientSpec[], servings: number) {
  const foods = await getFoods([...specs.map((s) => s.foodNo), DEFAULT_OIL_FOOD_NO]);
  const inputs: IngredientInput[] = [];
  for (const spec of specs) {
    const food = foods.get(spec.foodNo);
    if (!food) throw new Error(`食品が見つかりません: ${spec.foodNo}`);
    const cooks = spec.role === "ingredient" && spec.method !== "raw";
    inputs.push({
      ...spec,
      food,
      variant: cooks ? await resolveVariant(spec.foodNo, spec.method) : null,
      coefficient: cooks ? await resolveCoefficient(spec.method, food.groupCode) : null,
    });
  }
  const result = calcRecipe(inputs, { servings, defaultOil: foods.get(DEFAULT_OIL_FOOD_NO)! });
  // 全成分のキーを揃える(欠けているキーは不明扱い)
  for (const code of NUTRIENT_CODES) {
    if (!(code in result.total)) result.total[code] = null;
    if (!(code in result.perServing)) result.perServing[code] = null;
  }
  return result;
}

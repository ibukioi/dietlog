/**
 * 市販品・料理(目安値)・手入力の分量換算(§4.2 ④)
 *   per_100g    : 摂取量 = N × g / 100
 *   per_serving : 摂取量 = N_serving × 個数
 */
import { type NutrientMap, roundMap, scale } from "@/domain/nutrients/types";

export interface ProductLike {
  basis: "per_100g" | "per_serving";
  servingSizeG: number | null;
  nutrients: NutrientMap;
}

export type ProductAmount = { grams: number } | { servings: number };

export function productIntake(p: ProductLike, amount: ProductAmount) {
  if ("grams" in amount) {
    if (p.basis === "per_100g") {
      return { nutrients: roundMap(scale(p.nutrients, amount.grams / 100)), grams: amount.grams };
    }
    if (!p.servingSizeG) throw new Error("1食あたりの重量が不明なためグラムで計算できません");
    return {
      nutrients: roundMap(scale(p.nutrients, amount.grams / p.servingSizeG)),
      grams: amount.grams,
    };
  }
  if (p.basis === "per_serving") {
    return {
      nutrients: roundMap(scale(p.nutrients, amount.servings)),
      grams: p.servingSizeG ? p.servingSizeG * amount.servings : null,
    };
  }
  if (!p.servingSizeG) throw new Error("1食あたりの重量が不明なため個数で計算できません");
  const grams = p.servingSizeG * amount.servings;
  return { nutrients: roundMap(scale(p.nutrients, grams / 100)), grams };
}

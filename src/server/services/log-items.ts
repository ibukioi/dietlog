import "server-only";

import type { FoodData } from "@/domain/calc/home-cooked";
import { type ProductAmount, productIntake } from "@/domain/calc/product";
import { NUTRIENT_CODES } from "@/domain/nutrients/catalog";
import { type NutrientMap, roundMap, scale } from "@/domain/nutrients/types";
import type { NewMealItem } from "@/server/repositories/meals";
import type { MyProduct } from "@/server/repositories/products";

export const MEXT_DATASET_ID = "mext-8th-2023-20260327";

type ItemBody = Omit<NewMealItem, "date" | "mealType">;

function complete(n: NutrientMap): NutrientMap {
  const out: NutrientMap = {};
  for (const code of NUTRIENT_CODES) out[code] = code in n ? n[code] : null;
  return out;
}

/** 成分表の食品・料理をグラムで記録(料理・惣菜は目安値) */
export function mextItem(food: FoodData & { isDish?: boolean }, grams: number): ItemBody {
  return {
    kind: "mext_dish",
    foodNo: food.foodNo,
    name: food.name,
    quantity: grams,
    unit: "g",
    grams,
    nutrients: complete(roundMap(scale(food.nutrients, grams / 100))),
    isEstimate: true,
    sourceLabel: "八訂成分表",
    datasetVersionId: MEXT_DATASET_ID,
  };
}

export function productItem(p: MyProduct, amount: ProductAmount): ItemBody {
  const r = productIntake({ basis: p.basis, servingSizeG: p.servingSizeG, nutrients: p.nutrientsJson }, amount);
  const isServings = "servings" in amount;
  return {
    kind: p.source === "manual" || p.source === "label_photo" ? "manual" : "product",
    myProductId: p.id,
    foodNo: p.source === "mext" ? p.externalRef : null,
    name: p.brand ? `${p.name}(${p.brand})` : p.name,
    quantity: isServings ? amount.servings : amount.grams,
    unit: isServings ? (p.servingLabel ?? "食") : "g",
    grams: r.grams,
    nutrients: complete(r.nutrients),
    isEstimate: p.isEstimate,
    sourceLabel: p.source === "off" ? "Open Food Facts" : p.source === "mext" ? "八訂成分表" : "手入力",
  };
}

export function recipeItem(
  recipe: { id: string; name: string },
  perServing: NutrientMap,
  servings: number,
  trace: unknown,
): ItemBody {
  return {
    kind: "home_cooked",
    recipeId: recipe.id,
    name: recipe.name,
    quantity: servings,
    unit: "人前",
    grams: null,
    nutrients: complete(roundMap(scale(perServing, servings))),
    calcTrace: trace,
    isEstimate: false,
    sourceLabel: "自炊(八訂成分表で計算)",
    datasetVersionId: MEXT_DATASET_ID,
  };
}

export function manualItem(name: string, nutrients: NutrientMap): ItemBody {
  return {
    kind: "manual",
    name,
    quantity: 1,
    unit: "食",
    grams: null,
    nutrients: complete(nutrients),
    isEstimate: false,
    sourceLabel: "手入力",
  };
}

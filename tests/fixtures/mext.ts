import sample from "./mext-sample.json";

import type { FoodData } from "@/domain/calc/home-cooked";
import { parseMextValue } from "@/domain/mext/parse-value";
import type { NutrientMap } from "@/domain/nutrients/types";

/** 成分表の実データ(抜粋)を FoodData に変換する */
export function food(foodNo: string): FoodData {
  const f = sample.find((x) => x.foodNo === foodNo);
  if (!f) throw new Error(`fixture にない食品: ${foodNo}`);
  const nutrients: NutrientMap = {};
  for (const [code, raw] of Object.entries(f.values)) nutrients[code] = parseMextValue(raw).value;
  return {
    foodNo: f.foodNo,
    name: f.nameRaw,
    groupCode: f.groupCode,
    refuseRate: parseMextValue(f.refuse).value,
    densityGPerMl: f.density,
    nutrients,
  };
}

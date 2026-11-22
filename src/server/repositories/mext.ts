import "server-only";

import { and, asc, desc, eq, inArray, like, or, sql } from "drizzle-orm";

import type { CoefficientData, CookedVariantData, FoodData } from "@/domain/calc/home-cooked";
import type { NutrientMap } from "@/domain/nutrients/types";
import { expandFoodQuery } from "@/lib/food-query";
import { db } from "@/server/db/client";
import * as s from "@/server/db/schema";

export interface FoodSearchHit {
  foodNo: string;
  nameDisplay: string;
  nameRaw: string;
  groupCode: string;
  isCooked: boolean;
  isDish: boolean;
  energyKcal: number | null;
}

/**
 * 成分表の食品検索(入力中のリアルタイム検索用、DB 内のみ)。
 * 正規化した語をすべて含む食品を返す。別名(同義語辞書)にも当てる。
 */
export async function searchMextFoods(
  query: string,
  opts: { mode: "ingredient" | "dish" | "seasoning"; limit?: number },
): Promise<FoodSearchHit[]> {
  const terms = expandFoodQuery(query);
  if (terms.length === 0) return [];
  const limit = opts.limit ?? 30;

  const conds = terms.map((t) =>
    or(
      like(s.mextFood.searchText, `%${t}%`),
      sql`exists (select 1 from ${s.mextFoodAlias} a where a.food_no = ${s.mextFood.foodNo} and a.alias like ${`%${t}%`})`,
    ),
  );
  if (opts.mode === "ingredient") conds.push(eq(s.mextFood.isCooked, false));
  if (opts.mode === "seasoning") conds.push(inArray(s.mextFood.groupCode, ["03", "14", "17", "16"]));

  const first = terms[0];
  const rows = await db
    .select({
      foodNo: s.mextFood.foodNo,
      nameDisplay: s.mextFood.nameDisplay,
      nameRaw: s.mextFood.nameRaw,
      groupCode: s.mextFood.groupCode,
      isCooked: s.mextFood.isCooked,
      isDish: s.mextFood.isDish,
      energyKcal: s.mextFoodNutrient.value,
    })
    .from(s.mextFood)
    .leftJoin(
      s.mextFoodNutrient,
      and(eq(s.mextFoodNutrient.foodNo, s.mextFood.foodNo), eq(s.mextFoodNutrient.nutrientCode, "ENERC_KCAL")),
    )
    .where(and(...conds))
    .orderBy(
      // 料理タブでは料理・惣菜(18群・調理済み)を先に
      desc(s.mextFood.popularity),
      ...(opts.mode === "dish" ? [desc(s.mextFood.isDish)] : []),
      ...(opts.mode === "ingredient" ? [desc(sql`${s.mextFood.nameRaw} like '%生'`)] : []),
      // 名前の先頭に近い位置で一致するもの(別名だけで一致したものは後ろ)、短い名前を先に
      asc(
        sql`case when instr(${s.mextFood.searchText}, ${first}) = 0 then 999 else instr(${s.mextFood.searchText}, ${first}) end`,
      ),
      asc(sql`length(${s.mextFood.nameRaw})`),
    )
    .limit(limit);
  return rows;
}

export async function getFoods(foodNos: string[]): Promise<Map<string, FoodData>> {
  const out = new Map<string, FoodData>();
  if (foodNos.length === 0) return out;
  const uniq = [...new Set(foodNos)];
  const foods = await db.select().from(s.mextFood).where(inArray(s.mextFood.foodNo, uniq));
  const values = await db
    .select({
      foodNo: s.mextFoodNutrient.foodNo,
      code: s.mextFoodNutrient.nutrientCode,
      value: s.mextFoodNutrient.value,
    })
    .from(s.mextFoodNutrient)
    .where(inArray(s.mextFoodNutrient.foodNo, uniq));
  const byFood = new Map<string, NutrientMap>();
  for (const v of values) {
    const m = byFood.get(v.foodNo) ?? {};
    m[v.code] = v.value;
    byFood.set(v.foodNo, m);
  }
  for (const f of foods) {
    out.set(f.foodNo, {
      foodNo: f.foodNo,
      name: f.nameDisplay,
      groupCode: f.groupCode,
      refuseRate: f.refuseRate,
      densityGPerMl: f.densityGPerMl,
      nutrients: byFood.get(f.foodNo) ?? {},
    });
  }
  return out;
}

export async function getFood(foodNo: string): Promise<FoodData | null> {
  return (await getFoods([foodNo])).get(foodNo) ?? null;
}

/** 生食品で使える調理法(調理後データがある調理法) */
export async function cookedVariantsFor(rawFoodNo: string) {
  return db
    .select({
      method: s.mextCookedVariant.cookingMethodCode,
      cookedFoodNo: s.mextCookedVariant.cookedFoodNo,
      weightChangeRate: s.mextCookedVariant.weightChangeRate,
      includesOil: s.mextCookedVariant.includesOil,
      cookedName: s.mextFood.nameDisplay,
    })
    .from(s.mextCookedVariant)
    .innerJoin(s.mextFood, eq(s.mextFood.foodNo, s.mextCookedVariant.cookedFoodNo))
    .where(eq(s.mextCookedVariant.rawFoodNo, rawFoodNo));
}

export async function resolveVariant(rawFoodNo: string, method: string): Promise<CookedVariantData | null> {
  if (method === "raw") return null;
  const [v] = await db
    .select()
    .from(s.mextCookedVariant)
    .where(and(eq(s.mextCookedVariant.rawFoodNo, rawFoodNo), eq(s.mextCookedVariant.cookingMethodCode, method)))
    .limit(1);
  if (!v) return null;
  const cooked = await getFood(v.cookedFoodNo);
  if (!cooked) return null;
  return { cookedFood: cooked, weightChangeRate: v.weightChangeRate, includesOil: v.includesOil };
}

export async function resolveCoefficient(method: string, groupCode: string): Promise<CoefficientData | null> {
  if (method === "raw") return null;
  const rows = await db
    .select()
    .from(s.cookingCoefficient)
    .where(
      and(
        eq(s.cookingCoefficient.cookingMethodCode, method),
        inArray(s.cookingCoefficient.foodCategory, [groupCode, "*"]),
      ),
    );
  // 同じ食品群で 3 件以上の例があれば群の中央値、なければ全体の中央値
  const group = rows.find((r) => r.foodCategory === groupCode && r.sampleSize >= 3);
  const all = rows.find((r) => r.foodCategory === "*");
  const r = group ?? all;
  return r ? { weightChangeRate: r.weightChangeRate, oilAbsorptionPct: r.oilAbsorptionPct, basis: r.basis } : null;
}

/** 栄養素を多く含む食品の例(分析画面の「食事から摂る工夫」用) */
export async function topFoodsByNutrient(code: string, limit = 5) {
  return db
    .select({ foodNo: s.mextFood.foodNo, name: s.mextFood.nameDisplay, value: s.mextFoodNutrient.value })
    .from(s.mextFoodNutrient)
    .innerJoin(s.mextFood, eq(s.mextFood.foodNo, s.mextFoodNutrient.foodNo))
    .where(
      and(
        eq(s.mextFoodNutrient.nutrientCode, code),
        // 日常的に食べる量に近い「生・ゆで・焼き」等の食品、主食・おかずになる食品群に絞る
        inArray(s.mextFood.groupCode, ["01", "02", "04", "06", "07", "08", "09", "10", "11", "12", "13"]),
        sql`${s.mextFood.nameRaw} not like '%乾%' and ${s.mextFood.nameRaw} not like '%粉%' and ${s.mextFood.nameRaw} not like '%干し%'`,
      ),
    )
    .orderBy(desc(s.mextFoodNutrient.value))
    .limit(limit);
}

export async function mextDatasetLabel() {
  const [v] = await db.select().from(s.datasetVersion).where(eq(s.datasetVersion.source, "mext")).limit(1);
  return v;
}

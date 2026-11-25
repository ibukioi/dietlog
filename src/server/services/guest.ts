import "server-only";

import { eq } from "drizzle-orm";

import template from "../../../data/seed/guest-template.json";
import type { NutrientMap } from "@/domain/nutrients/types";
import { CORE } from "@/domain/nutrients/catalog";
import { valueOf } from "@/domain/nutrients/types";
import { type MealType, shiftIso, todayIso } from "@/lib/dates";
import { db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { getFoods } from "@/server/repositories/mext";
import { resetGoalsFromProfile, upsertProfile } from "@/server/repositories/profile";
import { saveMyProduct, getMyProduct } from "@/server/repositories/products";
import { saveRecipe } from "@/server/repositories/recipes";
import { type IngredientSpec, calculateHomeCooked } from "@/server/services/home-cooked";
import { manualItem, mextItem, productItem, recipeItem } from "@/server/services/log-items";

export const GUEST_TTL_DAYS = 14;
export const MAX_GUEST_USERS = 2000;

type Entry =
  | { food: string; grams: number }
  | { recipe: string; servings: number }
  | { product: string; servings: number }
  | { manual: { name: string; nutrients: NutrientMap } };

/** お試しユーザーにサンプルデータを入れる(§8.1)。日付は今日からの相対で生成する */
export async function seedGuest(userId: string, now = new Date()) {
  const today = todayIso(now);
  const p = template.profile;
  const birthYear = now.getFullYear() - p.ageYears - (now.getMonth() + 1 < p.birthMonth ? 1 : 0);
  await upsertProfile(userId, {
    birthYearMonth: `${birthYear}-${String(p.birthMonth).padStart(2, "0")}`,
    sex: p.sex as "female",
    heightCm: p.heightCm,
    weightKg: p.weightKg,
    activityLevel: p.activityLevel as "II",
    lifeStage: "none",
    menstruation: p.menstruation,
    timezone: "Asia/Tokyo",
  });
  const [profile] = await db.select().from(s.profile).where(eq(s.profile.userId, userId));
  await resetGoalsFromProfile(userId, profile);

  const productIds = new Map<string, string>();
  for (const prod of template.products) {
    const id = await saveMyProduct(userId, {
      source: "manual",
      externalRef: null,
      name: prod.name,
      brand: null,
      basis: prod.basis as "per_serving",
      servingSizeG: prod.servingSizeG,
      servingLabel: prod.servingLabel,
      nutrientsJson: prod.nutrients as NutrientMap,
      isEstimate: false,
    });
    productIds.set(prod.key, id);
  }

  const recipes = new Map<string, { id: string; name: string; perServing: NutrientMap; trace: unknown }>();
  for (const r of template.recipes) {
    const specs = r.ingredients as IngredientSpec[];
    const id = await saveRecipe(
      userId,
      { name: r.name, servings: r.servings },
      specs.map((i) => ({
        role: i.role,
        foodNo: i.foodNo,
        amount: i.amount,
        unit: i.unit,
        grams: i.amount,
        weightBasis: i.weightBasis,
        cookingMethodCode: i.method,
        consumeAll: false,
      })),
    );
    const result = await calculateHomeCooked(specs, r.servings);
    recipes.set(r.key, {
      id,
      name: r.name,
      perServing: result.perServing,
      trace: { lines: result.lines, oil: result.oil, notes: result.notes, specs, servings: r.servings },
    });
  }

  const days = template.days as Record<string, Partial<Record<MealType, Entry[]>>>;
  const foodNos = Object.values(days).flatMap((d) =>
    Object.values(d).flatMap((es) => (es ?? []).flatMap((e) => ("food" in e ? [e.food] : []))),
  );
  const foods = await getFoods(foodNos);
  const products = new Map(
    await Promise.all(
      [...productIds.entries()].map(async ([k, id]) => [k, (await getMyProduct(userId, id))!] as const),
    ),
  );

  const mealRows: (typeof s.meal.$inferInsert)[] = [];
  const itemRows: (typeof s.mealItem.$inferInsert)[] = [];
  for (const [offset, meals] of Object.entries(days)) {
    const date = shiftIso(today, Number(offset));
    for (const [mealType, entries] of Object.entries(meals) as [MealType, Entry[]][]) {
      if (!entries?.length) continue;
      const mealId = crypto.randomUUID();
      mealRows.push({ id: mealId, userId, eatenOn: date, mealType });
      for (const e of entries) {
        const body =
          "food" in e
            ? mextItem(foods.get(e.food)!, e.grams)
            : "recipe" in e
              ? (() => {
                  const r = recipes.get(e.recipe)!;
                  return recipeItem(r, r.perServing, e.servings, r.trace);
                })()
              : "product" in e
                ? productItem(products.get(e.product)!, { servings: e.servings })
                : manualItem(e.manual.name, e.manual.nutrients);
        const n = body.nutrients;
        itemRows.push({
          mealId,
          userId,
          kind: body.kind,
          myProductId: body.myProductId ?? null,
          recipeId: body.recipeId ?? null,
          foodNo: body.foodNo ?? null,
          nameSnapshot: body.name,
          quantity: body.quantity,
          unit: body.unit,
          grams: body.grams,
          energyKcal: valueOf(n, CORE.energy),
          proteinG: valueOf(n, CORE.protein),
          fatG: valueOf(n, CORE.fat),
          carbG: valueOf(n, CORE.carb),
          saltG: valueOf(n, CORE.salt),
          nutrientsJson: n,
          calcTraceJson: body.calcTrace ?? null,
          isEstimate: body.isEstimate,
          sourceLabel: body.sourceLabel,
          datasetVersionId: body.datasetVersionId ?? null,
          isSample: true,
        });
      }
    }
  }
  await db.transaction(async (tx) => {
    if (mealRows.length) await tx.insert(s.meal).values(mealRows);
    if (itemRows.length) await tx.insert(s.mealItem).values(itemRows);
    // 開始直後のお試しユーザーにはサンプルしかないので、プロフィール・タグ・商品をまとめて印を付ける
    await tx.update(s.profile).set({ isSample: true }).where(eq(s.profile.userId, userId));
    await tx.update(s.recipe).set({ isSample: true }).where(eq(s.recipe.userId, userId));
    await tx.update(s.myProduct).set({ isSample: true }).where(eq(s.myProduct.userId, userId));
  });

  const expires = new Date(now.getTime() + GUEST_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.update(s.user).set({ guestExpiresAt: expires }).where(eq(s.user.id, userId));
  return { meals: mealRows.length, items: itemRows.length, expires };
}

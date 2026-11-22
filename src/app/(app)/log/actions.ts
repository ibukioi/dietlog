"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { COOKING_METHODS } from "@/domain/mext/cooking";
import { PRIMARY_CODES } from "@/domain/nutrients/catalog";
import type { NutrientMap } from "@/domain/nutrients/types";
import { MEAL_TYPES } from "@/lib/dates";
import { requireUser } from "@/server/auth/session";
import { addMealItem } from "@/server/repositories/meals";
import { getFood, getFoods } from "@/server/repositories/mext";
import { getMyProduct, saveMyProduct, touchMyProduct } from "@/server/repositories/products";
import { getRecipe, saveRecipe, touchRecipe } from "@/server/repositories/recipes";
import { type IngredientSpec, calculateHomeCooked } from "@/server/services/home-cooked";
import { mextItem, productItem, recipeItem } from "@/server/services/log-items";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const where = z.object({ date: dateSchema, mealType: z.enum(MEAL_TYPES) });

function done() {
  revalidatePath("/home");
  revalidatePath("/history");
  return { ok: true as const };
}

// --- 料理・惣菜(成分表の目安値) ---------------------------------------------
const mextDishSchema = where.extend({ foodNo: z.string().regex(/^\d{5}$/), grams: z.number().positive().max(5000) });

export async function logMextDish(input: z.infer<typeof mextDishSchema>) {
  const user = await requireUser();
  const v = mextDishSchema.parse(input);
  const food = await getFood(v.foodNo);
  if (!food) throw new Error("食品が見つかりません");
  await addMealItem(user.id, { date: v.date, mealType: v.mealType, ...mextItem(food, v.grams) });
  return done();
}

// --- 自分の商品マスタから ------------------------------------------------------
const productLogSchema = where.extend({
  productId: z.string().uuid(),
  amount: z.union([
    z.object({ grams: z.number().positive().max(5000) }),
    z.object({ servings: z.number().positive().max(50) }),
  ]),
});

export async function logMyProduct(input: z.infer<typeof productLogSchema>) {
  const user = await requireUser();
  const v = productLogSchema.parse(input);
  const p = await getMyProduct(user.id, v.productId);
  if (!p) throw new Error("商品が見つかりません");
  await addMealItem(user.id, { date: v.date, mealType: v.mealType, ...productItem(p, v.amount) });
  await touchMyProduct(user.id, p.id);
  return done();
}

// --- 手入力(パッケージの表示)・OFF の商品を保存して記録 -----------------------
const nutrientInput = z.record(z.string(), z.number().min(0).max(100000).nullable());
const productSaveSchema = z.object({
  id: z.string().uuid().optional(),
  source: z.enum(["off", "manual", "label_photo"]),
  externalRef: z.string().max(64).nullable(),
  name: z.string().trim().min(1).max(80),
  brand: z.string().trim().max(60).nullable(),
  basis: z.enum(["per_100g", "per_serving"]),
  servingSizeG: z.number().positive().max(5000).nullable(),
  servingLabel: z.string().trim().max(20).nullable(),
  nutrients: nutrientInput,
  imageBlobUrl: z.string().url().nullable().optional(),
});

function normalizeNutrients(n: Record<string, number | null>): NutrientMap {
  const out: NutrientMap = {};
  for (const [k, v] of Object.entries(n)) out[k] = v;
  for (const code of PRIMARY_CODES) if (!(code in out)) out[code] = null;
  return out;
}

export async function saveProductAction(input: z.infer<typeof productSaveSchema>) {
  const user = await requireUser();
  const v = productSaveSchema.parse(input);
  const id = await saveMyProduct(
    user.id,
    {
      source: v.source,
      externalRef: v.externalRef,
      name: v.name,
      brand: v.brand,
      basis: v.basis,
      servingSizeG: v.servingSizeG,
      servingLabel: v.servingLabel,
      nutrientsJson: normalizeNutrients(v.nutrients),
      imageBlobUrl: v.imageBlobUrl ?? null,
      isEstimate: false,
    },
    v.id,
  );
  revalidatePath("/products");
  return { id };
}

const saveAndLogSchema = where.extend({
  product: productSaveSchema,
  amount: productLogSchema.shape.amount,
});

export async function saveAndLogProduct(input: z.infer<typeof saveAndLogSchema>) {
  const user = await requireUser();
  const v = saveAndLogSchema.parse(input);
  const { id } = await saveProductAction(v.product);
  const p = await getMyProduct(user.id, id);
  await addMealItem(user.id, { date: v.date, mealType: v.mealType, ...productItem(p!, v.amount) });
  await touchMyProduct(user.id, id);
  return done();
}

// --- 自炊 --------------------------------------------------------------------
const methodCodes = COOKING_METHODS.map((m) => m.code) as [string, ...string[]];
const ingredientSchema = z.object({
  role: z.enum(["ingredient", "oil", "seasoning"]),
  foodNo: z.string().regex(/^\d{5}$/),
  amount: z.number().positive().max(10000),
  unit: z.enum(["g", "ml", "tbsp", "tsp"]),
  weightBasis: z.enum(["raw", "purchased", "cooked"]),
  method: z.enum(methodCodes),
  consumeAll: z.boolean().optional(),
});
const homeCookedSchema = z.object({
  ingredients: z.array(ingredientSchema).min(1).max(40),
  servings: z.number().positive().max(20),
});

export async function previewHomeCooked(input: z.infer<typeof homeCookedSchema>) {
  await requireUser();
  const v = homeCookedSchema.parse(input);
  return calculateHomeCooked(v.ingredients as IngredientSpec[], v.servings);
}

const logHomeCookedSchema = where.extend({
  recipeId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(60),
  ingredients: homeCookedSchema.shape.ingredients,
  servings: homeCookedSchema.shape.servings,
  eatenServings: z.number().positive().max(20),
  saveAsTag: z.boolean(),
});

export async function logHomeCooked(input: z.infer<typeof logHomeCookedSchema>) {
  const user = await requireUser();
  const v = logHomeCookedSchema.parse(input);
  const result = await calculateHomeCooked(v.ingredients as IngredientSpec[], v.servings);
  let recipeId = v.recipeId ?? null;
  if (v.saveAsTag) {
    recipeId = await saveRecipe(
      user.id,
      { name: v.name, servings: v.servings },
      v.ingredients.map((i) => ({
        role: i.role,
        foodNo: i.foodNo,
        amount: i.amount,
        unit: i.unit,
        grams: i.amount,
        weightBasis: i.weightBasis,
        cookingMethodCode: i.method,
        consumeAll: i.consumeAll ?? false,
      })),
      recipeId ?? undefined,
    );
    await touchRecipe(user.id, recipeId);
    revalidatePath("/recipes");
  }
  await addMealItem(user.id, {
    date: v.date,
    mealType: v.mealType,
    ...recipeItem({ id: recipeId ?? "", name: v.name }, result.perServing, v.eatenServings, {
      lines: result.lines,
      oil: result.oil,
      notes: result.notes,
    }),
    recipeId,
  });
  return done();
}

/** タグ(テンプレート)をワンタップで記録 */
const logRecipeSchema = where.extend({ recipeId: z.string().uuid(), eatenServings: z.number().positive().max(20) });

export async function logRecipe(input: z.infer<typeof logRecipeSchema>) {
  const user = await requireUser();
  const v = logRecipeSchema.parse(input);
  const r = await getRecipe(user.id, v.recipeId);
  if (!r) throw new Error("タグが見つかりません");
  const result = await calculateHomeCooked(
    r.ingredients.map((i) => ({
      role: i.role,
      foodNo: i.foodNo,
      amount: i.amount,
      unit: i.unit,
      weightBasis: i.weightBasis,
      method: i.cookingMethodCode as never,
      consumeAll: i.consumeAll,
    })),
    r.servings,
  );
  await addMealItem(user.id, {
    date: v.date,
    mealType: v.mealType,
    ...recipeItem(r, result.perServing, v.eatenServings, { lines: result.lines, oil: result.oil, notes: result.notes }),
  });
  await touchRecipe(user.id, r.id);
  return done();
}

/** タグ(レシピ)を自炊フォームに読み込む */
export async function getRecipeForEdit(recipeId: string) {
  const user = await requireUser();
  const r = await getRecipe(user.id, z.string().uuid().parse(recipeId));
  if (!r) return null;
  const foods = await getFoods(r.ingredients.map((i) => i.foodNo));
  return {
    id: r.id,
    name: r.name,
    servings: r.servings,
    ingredients: r.ingredients.map((i) => ({
      role: i.role,
      foodNo: i.foodNo,
      name: foods.get(i.foodNo)?.name ?? i.foodNo,
      amount: i.amount,
      unit: i.unit,
      weightBasis: i.weightBasis,
      method: i.cookingMethodCode,
      consumeAll: i.consumeAll,
    })),
  };
}

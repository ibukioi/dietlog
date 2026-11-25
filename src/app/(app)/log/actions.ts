"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { EATING_OUT_LABEL } from "@/domain/calc/eating-out";
import { COOKING_METHODS } from "@/domain/mext/cooking";
import { PRIMARY_CODES } from "@/domain/nutrients/catalog";
import type { NutrientMap } from "@/domain/nutrients/types";
import { MEAL_TYPES } from "@/lib/dates";
import { requireUser } from "@/server/auth/session";
import { addMealItem, getMealItem, updateMealItem } from "@/server/repositories/meals";
import { getFood, getFoods } from "@/server/repositories/mext";
import { getMyProduct, saveMyProduct, touchMyProduct } from "@/server/repositories/products";
import { getRecipe, saveRecipe, touchRecipe } from "@/server/repositories/recipes";
import { type IngredientSpec, calculateHomeCooked } from "@/server/services/home-cooked";
import { mextItem, productItem, recipeItem } from "@/server/services/log-items";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const where = z.object({ date: dateSchema, mealType: z.enum(MEAL_TYPES) });

function done(itemId?: string) {
  revalidatePath("/home");
  revalidatePath("/history");
  return { ok: true as const, itemId };
}

// --- 料理・惣菜(成分表の目安値) ---------------------------------------------
const mextDishSchema = where.extend({ foodNo: z.string().regex(/^\d{5}$/), grams: z.number().positive().max(5000) });

export async function logMextDish(input: z.infer<typeof mextDishSchema>) {
  const user = await requireUser();
  const v = mextDishSchema.parse(input);
  const food = await getFood(v.foodNo);
  if (!food) throw new Error("食品が見つかりません");
  const itemId = await addMealItem(user.id, { date: v.date, mealType: v.mealType, ...mextItem(food, v.grams) });
  return done(itemId);
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
  const itemId = await addMealItem(user.id, { date: v.date, mealType: v.mealType, ...productItem(p, v.amount) });
  await touchMyProduct(user.id, p.id);
  return done(itemId);
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
  const itemId = await addMealItem(user.id, { date: v.date, mealType: v.mealType, ...productItem(p!, v.amount) });
  await touchMyProduct(user.id, id);
  return done(itemId);
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

/** 記録に残す計算の内訳。specs と servings があれば、あとで自炊フォームに読み込んで編集できる */
function traceOf(result: Awaited<ReturnType<typeof calculateHomeCooked>>) {
  return { lines: result.lines, oil: result.oil, notes: result.notes };
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
  const itemId = await addMealItem(user.id, {
    date: v.date,
    mealType: v.mealType,
    ...recipeItem({ id: recipeId ?? "", name: v.name }, result.perServing, v.eatenServings, {
      ...traceOf(result),
      specs: v.ingredients,
      servings: v.servings,
    }),
    recipeId,
  });
  return done(itemId);
}

/** 外食を材料から推定して記録(1 人前を食べた扱い。量は推計値なので「推定値」として残す) */
const logEatingOutSchema = where.extend({
  name: logHomeCookedSchema.shape.name,
  ingredients: homeCookedSchema.shape.ingredients,
  /** 推定に使った入力(あとで見返す・計算をやり直すため) */
  estimate: z.object({
    dishType: z.string().max(20),
    size: z.enum(["small", "regular", "large"]),
    method: z.enum(methodCodes),
    addSeasoning: z.boolean(),
  }),
});

export async function logEatingOut(input: z.infer<typeof logEatingOutSchema>) {
  const user = await requireUser();
  const v = logEatingOutSchema.parse(input);
  const specs = v.ingredients as IngredientSpec[];
  const result = await calculateHomeCooked(specs, 1);
  const body = recipeItem({ id: "", name: v.name }, result.perServing, 1, {
    ...traceOf(result),
    specs,
    servings: 1,
    estimate: v.estimate,
  });
  const itemId = await addMealItem(user.id, {
    date: v.date,
    mealType: v.mealType,
    ...body,
    recipeId: null,
    isEstimate: true,
    sourceLabel: EATING_OUT_LABEL,
  });
  return done(itemId);
}

/** タグ(テンプレート)をワンタップで記録 */
const logRecipeSchema = where.extend({ recipeId: z.string().uuid(), eatenServings: z.number().positive().max(20) });

export async function logRecipe(input: z.infer<typeof logRecipeSchema>) {
  const user = await requireUser();
  const v = logRecipeSchema.parse(input);
  const r = await getRecipe(user.id, v.recipeId);
  if (!r) throw new Error("タグが見つかりません");
  const specs: IngredientSpec[] = r.ingredients.map((i) => ({
    role: i.role,
    foodNo: i.foodNo,
    amount: i.amount,
    unit: i.unit,
    weightBasis: i.weightBasis,
    method: i.cookingMethodCode as IngredientSpec["method"],
    consumeAll: i.consumeAll,
  }));
  const result = await calculateHomeCooked(specs, r.servings);
  const itemId = await addMealItem(user.id, {
    date: v.date,
    mealType: v.mealType,
    ...recipeItem(r, result.perServing, v.eatenServings, { ...traceOf(result), specs, servings: r.servings }),
  });
  await touchRecipe(user.id, r.id);
  return done(itemId);
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

type TraceWithSpecs = { specs?: IngredientSpec[]; servings?: number };

/** 自炊の記録を自炊フォームに読み込む(材料・分量から編集するため) */
export async function getMealItemForCookEdit(itemId: string) {
  const user = await requireUser();
  const item = await getMealItem(user.id, z.string().uuid().parse(itemId));
  if (!item || item.kind !== "home_cooked") return null;
  const trace = (item.calcTraceJson ?? {}) as TraceWithSpecs;
  let specs = trace.specs ?? null;
  let servings = trace.servings ?? null;
  // 古い記録(材料を残していない)は、元のタグから材料を読み込む
  if (!specs && item.recipeId) {
    const r = await getRecipe(user.id, item.recipeId);
    if (r) {
      specs = r.ingredients.map((i) => ({
        role: i.role,
        foodNo: i.foodNo,
        amount: i.amount,
        unit: i.unit,
        weightBasis: i.weightBasis,
        method: i.cookingMethodCode as IngredientSpec["method"],
        consumeAll: i.consumeAll,
      }));
      servings = r.servings;
    }
  }
  if (!specs || !servings) return null;
  const foods = await getFoods(specs.map((i) => i.foodNo));
  return {
    itemId: item.id,
    recipeId: item.recipeId,
    name: item.nameSnapshot,
    date: item.eatenOn,
    mealType: item.mealType,
    servings,
    eatenServings: item.quantity,
    ingredients: specs.map((i) => ({ ...i, name: foods.get(i.foodNo)?.name ?? i.foodNo })),
  };
}

const updateHomeCookedSchema = logHomeCookedSchema.extend({ itemId: z.string().uuid() });

/** 自炊の記録を、材料・分量から計算し直して上書きする */
export async function updateHomeCooked(input: z.infer<typeof updateHomeCookedSchema>) {
  const user = await requireUser();
  const v = updateHomeCookedSchema.parse(input);
  const specs = v.ingredients as IngredientSpec[];
  const result = await calculateHomeCooked(specs, v.servings);
  if (v.saveAsTag) {
    await saveRecipe(
      user.id,
      { name: v.name, servings: v.servings },
      specs.map((i) => ({
        role: i.role,
        foodNo: i.foodNo,
        amount: i.amount,
        unit: i.unit,
        grams: i.amount,
        weightBasis: i.weightBasis,
        cookingMethodCode: i.method,
        consumeAll: i.consumeAll ?? false,
      })),
      v.recipeId,
    );
    revalidatePath("/recipes");
  }
  const body = recipeItem({ id: v.recipeId ?? "", name: v.name }, result.perServing, v.eatenServings, {
    ...traceOf(result),
    specs,
    servings: v.servings,
  });
  const ok = await updateMealItem(user.id, v.itemId, {
    name: v.name,
    date: v.date,
    mealType: v.mealType,
    quantity: v.eatenServings,
    nutrients: body.nutrients,
    calcTrace: body.calcTrace,
  });
  if (!ok) throw new Error("記録が見つかりません");
  revalidatePath("/analysis");
  return done(v.itemId);
}

// --- タグの編集(記録はしない) -------------------------------------------------
const updateRecipeSchema = z.object({
  recipeId: z.string().uuid(),
  name: logHomeCookedSchema.shape.name,
  ingredients: homeCookedSchema.shape.ingredients,
  servings: homeCookedSchema.shape.servings,
});

/** タグの名前・人数・材料を上書きする。記録済みの食事は変えない */
export async function updateRecipeAction(input: z.infer<typeof updateRecipeSchema>) {
  const user = await requireUser();
  const v = updateRecipeSchema.parse(input);
  await saveRecipe(
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
    v.recipeId,
  );
  revalidatePath("/recipes");
  revalidatePath("/log");
  return { ok: true as const };
}

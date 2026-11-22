import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import * as s from "@/server/db/schema";

export type Recipe = typeof s.recipe.$inferSelect;
export type RecipeIngredient = typeof s.recipeIngredient.$inferSelect;
export type RecipeIngredientInput = Omit<typeof s.recipeIngredient.$inferInsert, "id" | "recipeId">;

export async function listRecipes(userId: string) {
  const recipes = await db
    .select()
    .from(s.recipe)
    .where(eq(s.recipe.userId, userId))
    .orderBy(desc(s.recipe.useCount), desc(s.recipe.lastUsedAt), desc(s.recipe.createdAt));
  if (!recipes.length) return [];
  const ings = await db
    .select({ recipeId: s.recipeIngredient.recipeId, n: sql<number>`count(*)` })
    .from(s.recipeIngredient)
    .where(
      inArray(
        s.recipeIngredient.recipeId,
        recipes.map((r) => r.id),
      ),
    )
    .groupBy(s.recipeIngredient.recipeId);
  const counts = new Map(ings.map((i) => [i.recipeId, i.n]));
  return recipes.map((r) => ({ ...r, ingredientCount: counts.get(r.id) ?? 0 }));
}

export async function getRecipe(userId: string, id: string) {
  const [r] = await db
    .select()
    .from(s.recipe)
    .where(and(eq(s.recipe.id, id), eq(s.recipe.userId, userId)));
  if (!r) return null;
  const ingredients = await db
    .select()
    .from(s.recipeIngredient)
    .where(eq(s.recipeIngredient.recipeId, id))
    .orderBy(asc(s.recipeIngredient.sortOrder));
  return { ...r, ingredients };
}

export async function saveRecipe(
  userId: string,
  data: { name: string; servings: number; note?: string | null },
  ingredients: RecipeIngredientInput[],
  id?: string,
): Promise<string> {
  return db.transaction(async (tx) => {
    let recipeId = id;
    if (recipeId) {
      const res = await tx
        .update(s.recipe)
        .set(data)
        .where(and(eq(s.recipe.id, recipeId), eq(s.recipe.userId, userId)))
        .returning({ id: s.recipe.id });
      if (!res.length) throw new Error("not found");
      await tx.delete(s.recipeIngredient).where(eq(s.recipeIngredient.recipeId, recipeId));
    } else {
      const [row] = await tx
        .insert(s.recipe)
        .values({ ...data, userId })
        .returning({ id: s.recipe.id });
      recipeId = row.id;
    }
    if (ingredients.length)
      await tx
        .insert(s.recipeIngredient)
        .values(ingredients.map((ing, i) => ({ ...ing, recipeId: recipeId!, sortOrder: i })));
    return recipeId!;
  });
}

export async function touchRecipe(userId: string, id: string) {
  await db
    .update(s.recipe)
    .set({ useCount: sql`${s.recipe.useCount} + 1`, lastUsedAt: new Date() })
    .where(and(eq(s.recipe.id, id), eq(s.recipe.userId, userId)));
}

export async function deleteRecipe(userId: string, id: string) {
  const res = await db
    .delete(s.recipe)
    .where(and(eq(s.recipe.id, id), eq(s.recipe.userId, userId)))
    .returning({ id: s.recipe.id });
  return res.length > 0;
}

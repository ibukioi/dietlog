import "server-only";

import { and, asc, between, eq } from "drizzle-orm";

import { CORE } from "@/domain/nutrients/catalog";
import { type NutrientMap, valueOf } from "@/domain/nutrients/types";
import type { MealType } from "@/lib/dates";
import { db } from "@/server/db/client";
import * as s from "@/server/db/schema";

export type MealItemRow = typeof s.mealItem.$inferSelect & { eatenOn: string; mealType: MealType };

export interface NewMealItem {
  date: string;
  mealType: MealType;
  kind: "product" | "mext_dish" | "home_cooked" | "manual";
  myProductId?: string | null;
  recipeId?: string | null;
  foodNo?: string | null;
  name: string;
  quantity: number;
  unit: string;
  grams: number | null;
  nutrients: NutrientMap;
  calcTrace?: unknown;
  isEstimate: boolean;
  sourceLabel: string;
  datasetVersionId?: string | null;
}

async function ensureMeal(userId: string, date: string, mealType: MealType): Promise<string> {
  const [existing] = await db
    .select({ id: s.meal.id })
    .from(s.meal)
    .where(and(eq(s.meal.userId, userId), eq(s.meal.eatenOn, date), eq(s.meal.mealType, mealType)));
  if (existing) return existing.id;
  const [created] = await db
    .insert(s.meal)
    .values({ userId, eatenOn: date, mealType })
    .onConflictDoNothing()
    .returning({ id: s.meal.id });
  if (created) return created.id;
  return ensureMeal(userId, date, mealType);
}

export async function addMealItem(userId: string, item: NewMealItem) {
  const mealId = await ensureMeal(userId, item.date, item.mealType);
  const n = item.nutrients;
  const [row] = await db
    .insert(s.mealItem)
    .values({
      mealId,
      userId,
      kind: item.kind,
      myProductId: item.myProductId ?? null,
      recipeId: item.recipeId ?? null,
      foodNo: item.foodNo ?? null,
      nameSnapshot: item.name,
      quantity: item.quantity,
      unit: item.unit,
      grams: item.grams,
      energyKcal: valueOf(n, CORE.energy),
      proteinG: valueOf(n, CORE.protein),
      fatG: valueOf(n, CORE.fat),
      carbG: valueOf(n, CORE.carb),
      saltG: valueOf(n, CORE.salt),
      nutrientsJson: n,
      calcTraceJson: item.calcTrace ?? null,
      isEstimate: item.isEstimate,
      sourceLabel: item.sourceLabel,
      datasetVersionId: item.datasetVersionId ?? null,
    })
    .returning({ id: s.mealItem.id });
  return row.id;
}

export async function listItemsInRange(userId: string, from: string, to: string): Promise<MealItemRow[]> {
  const rows = await db
    .select({ item: s.mealItem, eatenOn: s.meal.eatenOn, mealType: s.meal.mealType })
    .from(s.mealItem)
    .innerJoin(s.meal, eq(s.meal.id, s.mealItem.mealId))
    .where(and(eq(s.mealItem.userId, userId), eq(s.meal.userId, userId), between(s.meal.eatenOn, from, to)))
    .orderBy(asc(s.meal.eatenOn), asc(s.mealItem.createdAt));
  return rows.map((r) => ({ ...r.item, eatenOn: r.eatenOn, mealType: r.mealType }));
}

/** 自分の記録だけを削除できる(他人の ID なら 0 件で false) */
export async function deleteMealItem(userId: string, id: string): Promise<boolean> {
  const res = await db
    .delete(s.mealItem)
    .where(and(eq(s.mealItem.id, id), eq(s.mealItem.userId, userId)))
    .returning({ id: s.mealItem.id });
  return res.length > 0;
}

export async function getDayStatuses(userId: string, from: string, to: string) {
  const rows = await db
    .select()
    .from(s.dayStatus)
    .where(and(eq(s.dayStatus.userId, userId), between(s.dayStatus.date, from, to)));
  return new Map(rows.map((r) => [r.date, r.isComplete]));
}

export async function setDayComplete(userId: string, date: string, isComplete: boolean) {
  await db
    .insert(s.dayStatus)
    .values({ userId, date, isComplete })
    .onConflictDoUpdate({ target: [s.dayStatus.userId, s.dayStatus.date], set: { isComplete } });
}

import "server-only";

import { gaugeState } from "@/domain/goals/goals";
import { NUTRIENT_CODES } from "@/domain/nutrients/catalog";
import { totals } from "@/domain/nutrients/types";
import { MEAL_TYPES, type MealType } from "@/lib/dates";
import { getDayStatuses, listItemsInRange } from "@/server/repositories/meals";
import { getGoals } from "@/server/repositories/profile";

export async function getDaySummary(userId: string, date: string) {
  const [items, goals, statuses] = await Promise.all([
    listItemsInRange(userId, date, date),
    getGoals(userId),
    getDayStatuses(userId, date, date),
  ]);
  const t = totals(
    items.map((i) => i.nutrientsJson),
    NUTRIENT_CODES,
  );
  const gauges = goals.map((g) => ({ goal: g, state: gaugeState(g, t[g.nutrientCode]) }));
  const byMeal = new Map<MealType, typeof items>(MEAL_TYPES.map((m) => [m, []]));
  for (const i of items) byMeal.get(i.mealType)!.push(i);
  return {
    items,
    byMeal,
    totals: t,
    gauges,
    isComplete: statuses.get(date) ?? false,
  };
}

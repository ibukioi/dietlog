import "server-only";

import { type AnalysisDay, type AnalysisPerson, analyzeTrend, analyzeWindow } from "@/domain/analysis/analyze";
import { shiftIso, todayIso } from "@/lib/dates";
import { getDayStatuses, listItemsInRange } from "@/server/repositories/meals";
import { topFoodsByNutrient } from "@/server/repositories/mext";
import { getProfile, profileAge } from "@/server/repositories/profile";

export async function getWeeklyAnalysis(userId: string) {
  const profile = await getProfile(userId);
  if (!profile) return { status: "no_profile" as const };
  const today = todayIso();
  const from = shiftIso(today, -28);
  const [items, statuses] = await Promise.all([
    listItemsInRange(userId, from, shiftIso(today, -1)),
    getDayStatuses(userId, from, today),
  ]);

  const byDate = new Map<string, AnalysisDay>();
  for (const i of items) {
    const d =
      byDate.get(i.eatenOn) ??
      ({
        date: i.eatenOn,
        items: [],
        mealTypeCount: 0,
        markedComplete: statuses.get(i.eatenOn) ?? false,
      } as AnalysisDay);
    d.items.push({ energyKcal: i.energyKcal, grams: i.grams, nutrients: i.nutrientsJson });
    byDate.set(i.eatenOn, d);
  }
  for (const [date, d] of byDate) {
    d.mealTypeCount = new Set(items.filter((i) => i.eatenOn === date).map((i) => i.mealType)).size;
  }
  for (const [date, complete] of statuses)
    if (complete && !byDate.has(date)) byDate.set(date, { date, items: [], mealTypeCount: 0, markedComplete: true });

  const person: AnalysisPerson = {
    age: profileAge(profile),
    sex: profile.sex,
    lifeStage: profile.lifeStage,
    menstruation: profile.menstruation,
  };
  const days = [...byDate.values()];
  const result = analyzeWindow(person, days, today);
  const trend = analyzeTrend(person, days, today);

  // 不足傾向・やや少なめの栄養素について、多く含む食品の例
  const tips: Record<string, Array<{ name: string; value: number | null }>> = {};
  if (result.status === "ok") {
    const low = result.nutrients.filter((n) =>
      ["deficient", "slightly_low", "below_ai", "below_dg"].includes(n.verdict),
    );
    await Promise.all(
      low.map(async (n) => {
        tips[n.code] = await topFoodsByNutrient(n.code, 5);
      }),
    );
  }
  return { status: "ready" as const, result, trend, tips };
}

import "server-only";

import { asc, eq } from "drizzle-orm";

import { ageFromBirthYearMonth } from "@/domain/dri/dri";
import { type Goal, defaultGoals } from "@/domain/goals/goals";
import { db } from "@/server/db/client";
import * as s from "@/server/db/schema";

export type Profile = typeof s.profile.$inferSelect;
export type ProfileInput = Omit<typeof s.profile.$inferInsert, "userId" | "updatedAt">;

export async function getProfile(userId: string): Promise<Profile | null> {
  const [p] = await db.select().from(s.profile).where(eq(s.profile.userId, userId));
  return p ?? null;
}

export async function upsertProfile(userId: string, input: ProfileInput) {
  await db
    .insert(s.profile)
    .values({ ...input, userId })
    // 利用者が保存したプロフィールはサンプルではない(本登録時に引き継ぐ)
    .onConflictDoUpdate({ target: s.profile.userId, set: { ...input, isSample: false, updatedAt: new Date() } });
}

export function profileAge(p: Profile, today = new Date()) {
  return ageFromBirthYearMonth(p.birthYearMonth, today);
}

export async function getGoals(userId: string): Promise<Goal[]> {
  const rows = await db
    .select()
    .from(s.nutritionGoal)
    .where(eq(s.nutritionGoal.userId, userId))
    .orderBy(asc(s.nutritionGoal.displayOrder));
  return rows.map((r) => ({
    nutrientCode: r.nutrientCode,
    target: r.target,
    direction: r.direction,
    upper: r.upper,
    showOnHome: r.showOnHome,
    displayOrder: r.displayOrder,
  }));
}

/** プロフィールから目標を作り直す(ユーザーが変えた目標も初期値に戻る) */
export async function resetGoalsFromProfile(userId: string, p: Profile) {
  const goals = defaultGoals({
    age: profileAge(p),
    sex: p.sex,
    weightKg: p.weightKg,
    activityLevel: p.activityLevel,
    menstruation: p.menstruation,
  });
  await db.transaction(async (tx) => {
    await tx.delete(s.nutritionGoal).where(eq(s.nutritionGoal.userId, userId));
    await tx.insert(s.nutritionGoal).values(goals.map((g) => ({ ...g, userId, source: "auto_dri" as const })));
  });
  return goals;
}

export async function saveGoals(userId: string, goals: Goal[]) {
  await db.transaction(async (tx) => {
    await tx.delete(s.nutritionGoal).where(eq(s.nutritionGoal.userId, userId));
    if (goals.length)
      await tx.insert(s.nutritionGoal).values(goals.map((g) => ({ ...g, userId, source: "custom" as const })));
  });
}

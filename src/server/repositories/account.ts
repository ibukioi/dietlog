import { eq } from "drizzle-orm";

import type { AppDb } from "@/server/db/create";
import * as s from "@/server/db/schema";

/**
 * お試しユーザーの記録を本登録ユーザーへ移す(GitHub 連携時)。
 * 本登録ユーザー側にプロフィール・目標が既にある場合はそちらを優先する。
 */
export async function transferUserData(db: AppDb, fromUserId: string, toUserId: string) {
  await db.transaction(async (tx) => {
    const [existingProfile] = await tx
      .select({ userId: s.profile.userId })
      .from(s.profile)
      .where(eq(s.profile.userId, toUserId));
    if (!existingProfile) {
      await tx.update(s.profile).set({ userId: toUserId }).where(eq(s.profile.userId, fromUserId));
      await tx.update(s.nutritionGoal).set({ userId: toUserId }).where(eq(s.nutritionGoal.userId, fromUserId));
    }
    await tx.update(s.myProduct).set({ userId: toUserId }).where(eq(s.myProduct.userId, fromUserId));
    await tx.update(s.recipe).set({ userId: toUserId }).where(eq(s.recipe.userId, fromUserId));
    await tx.update(s.meal).set({ userId: toUserId }).where(eq(s.meal.userId, fromUserId));
    await tx.update(s.mealItem).set({ userId: toUserId }).where(eq(s.mealItem.userId, fromUserId));
    await tx.update(s.dayStatus).set({ userId: toUserId }).where(eq(s.dayStatus.userId, fromUserId));
  });
}

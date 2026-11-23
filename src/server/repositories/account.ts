import { and, eq } from "drizzle-orm";

import type { AppDb } from "@/server/db/create";
import * as s from "@/server/db/schema";

/**
 * お試しユーザーの記録を本登録ユーザーへ移す(GitHub 連携時)。
 * 本登録ユーザー側にプロフィール・目標が既にある場合はそちらを優先する。
 * 既存アカウントと同じ商品・食事・日付があるときは、一意制約に触れないよう既存の行へまとめる。
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

    const productColumns = { id: s.myProduct.id, source: s.myProduct.source, externalRef: s.myProduct.externalRef };
    const productKey = (p: { source: string; externalRef: string | null }) => `${p.source}\u0000${p.externalRef}`;
    const targetProducts = await tx.select(productColumns).from(s.myProduct).where(eq(s.myProduct.userId, toUserId));
    const targetProductIds = new Map(
      targetProducts.filter((p) => p.externalRef !== null).map((p) => [productKey(p), p.id]),
    );
    const guestProducts = await tx.select(productColumns).from(s.myProduct).where(eq(s.myProduct.userId, fromUserId));
    for (const product of guestProducts) {
      const targetId = product.externalRef === null ? undefined : targetProductIds.get(productKey(product));
      if (!targetId) continue;
      await tx.update(s.mealItem).set({ myProductId: targetId }).where(eq(s.mealItem.myProductId, product.id));
      await tx.delete(s.myProduct).where(eq(s.myProduct.id, product.id));
    }
    await tx.update(s.myProduct).set({ userId: toUserId }).where(eq(s.myProduct.userId, fromUserId));
    await tx.update(s.recipe).set({ userId: toUserId }).where(eq(s.recipe.userId, fromUserId));

    const mealColumns = { id: s.meal.id, eatenOn: s.meal.eatenOn, mealType: s.meal.mealType };
    const mealKey = (m: { eatenOn: string; mealType: string }) => `${m.eatenOn}\u0000${m.mealType}`;
    const targetMeals = await tx.select(mealColumns).from(s.meal).where(eq(s.meal.userId, toUserId));
    const targetMealIds = new Map(targetMeals.map((m) => [mealKey(m), m.id]));
    const guestMeals = await tx.select(mealColumns).from(s.meal).where(eq(s.meal.userId, fromUserId));
    for (const meal of guestMeals) {
      const targetId = targetMealIds.get(mealKey(meal));
      if (!targetId) continue;
      await tx.update(s.mealItem).set({ mealId: targetId }).where(eq(s.mealItem.mealId, meal.id));
      await tx.delete(s.meal).where(eq(s.meal.id, meal.id));
    }
    await tx.update(s.meal).set({ userId: toUserId }).where(eq(s.meal.userId, fromUserId));
    await tx.update(s.mealItem).set({ userId: toUserId }).where(eq(s.mealItem.userId, fromUserId));

    const targetDays = await tx
      .select({ date: s.dayStatus.date })
      .from(s.dayStatus)
      .where(eq(s.dayStatus.userId, toUserId));
    for (const { date } of targetDays) {
      await tx.delete(s.dayStatus).where(and(eq(s.dayStatus.userId, fromUserId), eq(s.dayStatus.date, date)));
    }
    await tx.update(s.dayStatus).set({ userId: toUserId }).where(eq(s.dayStatus.userId, fromUserId));
  });
}

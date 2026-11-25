import { and, eq, inArray, notInArray, sql } from "drizzle-orm";

import type { AppDb } from "@/server/db/create";
import * as s from "@/server/db/schema";

/**
 * お試しユーザーの記録を本登録ユーザーへ移す(GitHub 連携時)。
 * - お試し開始時のサンプル(is_sample)は引き継がない。編集したもの・自分の記録で使ったタグや商品は引き継ぐ
 * - 本登録ユーザー側にプロフィール・目標が既にある場合はそちらを優先する。
 *   お試し側のプロフィールがサンプルのままなら引き継がず、本登録後にプロフィールを入力してもらう
 * - 既存アカウントと同じ商品・食事・日付があるときは、一意制約に触れないよう既存の行へまとめる
 */
export async function transferUserData(db: AppDb, fromUserId: string, toUserId: string) {
  await db.transaction(async (tx) => {
    await dropUnusedSamples(tx, fromUserId);

    const [existingProfile] = await tx
      .select({ userId: s.profile.userId })
      .from(s.profile)
      .where(eq(s.profile.userId, toUserId));
    const [guestProfile] = await tx
      .select({ isSample: s.profile.isSample })
      .from(s.profile)
      .where(eq(s.profile.userId, fromUserId));
    if (!existingProfile && guestProfile && !guestProfile.isSample) {
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
    await tx.update(s.mealPhoto).set({ userId: toUserId }).where(eq(s.mealPhoto.userId, fromUserId));

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

type Tx = Parameters<Parameters<AppDb["transaction"]>[0]>[0];

/** サンプルの記録を消し、自分の記録から使われていないサンプルのタグ・商品も消す */
async function dropUnusedSamples(tx: Tx, userId: string) {
  await tx.delete(s.mealItem).where(and(eq(s.mealItem.userId, userId), eq(s.mealItem.isSample, true)));
  // 中身が空になった食事を消す
  await tx
    .delete(s.meal)
    .where(
      and(
        eq(s.meal.userId, userId),
        sql`not exists (select 1 from ${s.mealItem} where ${s.mealItem.mealId} = ${s.meal.id})`,
      ),
    );

  const used = await tx
    .select({ recipeId: s.mealItem.recipeId, myProductId: s.mealItem.myProductId })
    .from(s.mealItem)
    .where(eq(s.mealItem.userId, userId));
  const usedRecipes = used.flatMap((u) => (u.recipeId ? [u.recipeId] : []));
  const usedProducts = used.flatMap((u) => (u.myProductId ? [u.myProductId] : []));

  await tx
    .delete(s.recipe)
    .where(
      and(
        eq(s.recipe.userId, userId),
        eq(s.recipe.isSample, true),
        usedRecipes.length ? notInArray(s.recipe.id, usedRecipes) : undefined,
      ),
    );
  await tx
    .delete(s.myProduct)
    .where(
      and(
        eq(s.myProduct.userId, userId),
        eq(s.myProduct.isSample, true),
        usedProducts.length ? notInArray(s.myProduct.id, usedProducts) : undefined,
      ),
    );
  // 残ったサンプルのタグ・商品は、自分の記録で使ったものなので利用者のものとして扱う
  if (usedRecipes.length) await tx.update(s.recipe).set({ isSample: false }).where(inArray(s.recipe.id, usedRecipes));
  if (usedProducts.length)
    await tx.update(s.myProduct).set({ isSample: false }).where(inArray(s.myProduct.id, usedProducts));
}

import "server-only";

import { and, asc, count, eq, lt } from "drizzle-orm";

import { db } from "@/server/db/client";
import * as s from "@/server/db/schema";

import { MAX_GUEST_USERS } from "./guest";

const DAY = 86_400_000;

/**
 * - 期限切れのお試しユーザーを削除(ON DELETE CASCADE で記録もすべて消える)
 * - お試しユーザーが上限を超えていれば古い順に削除
 * - 古い OFF キャッシュ・レート制限バケットを削除
 */
export async function cleanupExpired(now = new Date()) {
  const expired = await db
    .delete(s.user)
    .where(and(eq(s.user.isAnonymous, true), lt(s.user.guestExpiresAt, now)))
    .returning({ id: s.user.id });

  const [{ n }] = await db.select({ n: count() }).from(s.user).where(eq(s.user.isAnonymous, true));
  let overflow = 0;
  if (n > MAX_GUEST_USERS) {
    const victims = await db
      .select({ id: s.user.id })
      .from(s.user)
      .where(eq(s.user.isAnonymous, true))
      .orderBy(asc(s.user.createdAt))
      .limit(n - MAX_GUEST_USERS);
    for (const v of victims) await db.delete(s.user).where(eq(s.user.id, v.id));
    overflow = victims.length;
  }

  const searches = await db
    .delete(s.offSearchCache)
    .where(lt(s.offSearchCache.fetchedAt, new Date(now.getTime() - 7 * DAY)))
    .returning({ k: s.offSearchCache.queryNorm });
  const products = await db
    .delete(s.offProductCache)
    .where(lt(s.offProductCache.fetchedAt, new Date(now.getTime() - 30 * DAY)))
    .returning({ k: s.offProductCache.offCode });
  const buckets = await db
    .delete(s.rateLimitBucket)
    .where(lt(s.rateLimitBucket.windowStart, new Date(now.getTime() - DAY)))
    .returning({ k: s.rateLimitBucket.key });
  await db.delete(s.verification).where(lt(s.verification.expiresAt, now));

  return {
    expiredGuests: expired.length,
    overflowGuests: overflow,
    offSearchCache: searches.length,
    offProductCache: products.length,
    rateLimitBuckets: buckets.length,
  };
}

import "server-only";

import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import * as s from "@/server/db/schema";

/**
 * 固定ウィンドウ方式の簡易レート制限(DB テーブル、§1.1)。
 * 上限内なら true を返してカウントを 1 増やす。
 */
export async function takeToken(key: string, limit: number, windowMs: number, now = Date.now()): Promise<boolean> {
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  const [row] = await db
    .insert(s.rateLimitBucket)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: s.rateLimitBucket.key,
      set: {
        // ウィンドウが変わっていたらリセット
        count: sql`case when ${s.rateLimitBucket.windowStart} = ${windowStart.getTime()} then ${s.rateLimitBucket.count} + 1 else 1 end`,
        windowStart: sql`${windowStart.getTime()}`,
      },
    })
    .returning({ count: s.rateLimitBucket.count });
  return row.count <= limit;
}

/** 回路遮断(サーキットブレーカー): until までは外部呼び出しを止める */
export async function isCircuitOpen(key: string, now = Date.now()): Promise<boolean> {
  const [row] = await db
    .select()
    .from(s.rateLimitBucket)
    .where(eq(s.rateLimitBucket.key, `circuit:${key}`));
  return Boolean(row && row.windowStart.getTime() > now);
}

export async function openCircuit(key: string, ms: number, now = Date.now()) {
  const until = new Date(now + ms);
  await db
    .insert(s.rateLimitBucket)
    .values({ key: `circuit:${key}`, windowStart: until, count: 0 })
    .onConflictDoUpdate({ target: s.rateLimitBucket.key, set: { windowStart: until } });
}

export function hashIp(ip: string): string {
  return createHash("sha256")
    .update(`${process.env.IP_HASH_SALT ?? "dev"}:${ip}`)
    .digest("hex")
    .slice(0, 32);
}

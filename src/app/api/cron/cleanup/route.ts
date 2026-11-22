import { NextResponse } from "next/server";

import { cleanupExpired } from "@/server/services/cleanup";

/**
 * 1 日 1 回の定期削除(§8.3)。Vercel Cron から Authorization: Bearer <CRON_SECRET> 付きで呼ばれる
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await cleanupExpired();
  return NextResponse.json({ ok: true, ...result });
}

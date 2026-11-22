import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUser } from "@/server/auth/session";
import { searchOff } from "@/server/off/client";
import { takeToken } from "@/server/services/rate-limit";

/** OFF 検索のプロキシ(キャッシュ・レート制限つき)。検索確定時だけ呼ぶ */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (!q.trim()) return NextResponse.json({ status: "ok", source: "cache", products: [] });
  if (user.isAnonymous && !(await takeToken(`off_user:${user.id}`, 10, 60 * 60 * 1000))) {
    return NextResponse.json({
      status: "busy",
      message: "お試しモードの検索回数の上限(1時間に10回)に達しました。手入力で記録できます。",
    });
  }
  return NextResponse.json(await searchOff(q));
}

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUser } from "@/server/auth/session";
import { searchMextFoods } from "@/server/repositories/mext";

/** 成分表の検索(入力中のリアルタイム検索。DB 内のみで外部 API は呼ばない) */
export async function GET(req: NextRequest) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = req.nextUrl.searchParams.get("q")?.slice(0, 50) ?? "";
  const modeParam = req.nextUrl.searchParams.get("mode");
  const mode = modeParam === "dish" || modeParam === "seasoning" || modeParam === "oil" ? modeParam : "ingredient";
  const hits = await searchMextFoods(q, { mode, limit: 30 });
  return NextResponse.json({ hits });
}

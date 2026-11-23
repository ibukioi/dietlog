import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUser } from "@/server/auth/session";
import { readingTerms } from "@/server/search/ja-reading";

/** 画面内の絞り込み用に、検索語を読みに直す */
export async function GET(req: NextRequest) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = req.nextUrl.searchParams.get("q")?.slice(0, 50) ?? "";
  return NextResponse.json({ terms: await readingTerms(q) });
}

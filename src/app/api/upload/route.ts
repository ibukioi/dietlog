import { put } from "@vercel/blob";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/server/auth/session";
import { takeToken } from "@/server/services/rate-limit";

/** 商品写真のアップロード(参照用。§7.3)。BLOB_READ_WRITE_TOKEN 未設定なら無効 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  if (!process.env.BLOB_READ_WRITE_TOKEN)
    return NextResponse.json({ error: "写真のアップロードは現在無効です" }, { status: 503 });
  if (!(await takeToken(`upload:${user.id}`, 20, 60 * 60 * 1000)))
    return NextResponse.json({ error: "アップロード回数の上限に達しました(1時間に20枚)" }, { status: 429 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) return NextResponse.json({ error: "画像がありません" }, { status: 400 });
  if (file.size > 1_000_000) return NextResponse.json({ error: "画像は 1MB までです" }, { status: 413 });
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    return NextResponse.json({ error: "JPEG・PNG・WebP の画像を選んでください" }, { status: 415 });

  const blob = await put(`labels/${user.id}/${crypto.randomUUID()}.jpg`, file, {
    access: "public",
    contentType: file.type,
  });
  return NextResponse.json({ url: blob.url });
}

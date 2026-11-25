import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/server/auth/session";
import {
  MEAL_PHOTO_MAX_BYTES,
  deleteMealPhoto,
  getMealPhoto,
  setMealPhoto,
  sniffImageType,
} from "@/server/repositories/meal-photos";
import { takeToken } from "@/server/services/rate-limit";

type Ctx = { params: Promise<{ itemId: string }> };

async function context(ctx: Ctx) {
  const user = await getCurrentUser();
  const parsed = z
    .string()
    .uuid()
    .safeParse((await ctx.params).itemId);
  return { user, itemId: parsed.success ? parsed.data : null };
}

const notFound = () => NextResponse.json({ error: "写真が見つかりません" }, { status: 404 });

/** 自分の記録の写真だけを返す。URL の ?v= が変わるまでブラウザにキャッシュさせる */
export async function GET(_req: Request, ctx: Ctx) {
  const { user, itemId } = await context(ctx);
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  if (!itemId) return notFound();
  const photo = await getMealPhoto(user.id, itemId);
  if (!photo) return notFound();
  return new Response(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.contentType,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** 写真を付ける・差し替える(ブラウザで縮小した画像を受け取る) */
export async function POST(req: Request, ctx: Ctx) {
  const { user, itemId } = await context(ctx);
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  if (!itemId) return notFound();
  if (!(await takeToken(`meal_photo:${user.id}`, 30, 60 * 60 * 1000)))
    return NextResponse.json({ error: "写真の追加は 1 時間に 30 枚までです" }, { status: 429 });

  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof Blob)) return NextResponse.json({ error: "画像がありません" }, { status: 400 });
  if (file.size > MEAL_PHOTO_MAX_BYTES) return NextResponse.json({ error: "画像が大きすぎます" }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(bytes);
  if (!type) return NextResponse.json({ error: "JPEG・PNG・WebP の画像を選んでください" }, { status: 415 });

  const saved = await setMealPhoto(user.id, itemId, bytes, type);
  if (!saved) return notFound();
  revalidatePath("/home");
  return NextResponse.json(saved);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { user, itemId } = await context(ctx);
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  if (!itemId || !(await deleteMealPhoto(user.id, itemId))) return notFound();
  revalidatePath("/home");
  return NextResponse.json({ ok: true });
}

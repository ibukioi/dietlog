import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/server/db/client";
import * as s from "@/server/db/schema";

export const MEAL_PHOTO_MAX_BYTES = 800_000;
export const MEAL_PHOTO_TYPES = ["image/jpeg", "image/webp", "image/png"] as const;
export type MealPhotoType = (typeof MEAL_PHOTO_TYPES)[number];

/** 写真の URL。更新時刻を付けて、差し替えたらブラウザのキャッシュを使わないようにする */
export const mealPhotoUrl = (itemId: string, updatedAt: Date) => `/api/meal-photos/${itemId}?v=${updatedAt.getTime()}`;

/** 先頭のバイト列で画像の種類を確かめる(Content-Type の詐称を防ぐ) */
export function sniffImageType(bytes: Uint8Array): MealPhotoType | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

async function ownsItem(userId: string, itemId: string) {
  const [row] = await db
    .select({ id: s.mealItem.id })
    .from(s.mealItem)
    .where(and(eq(s.mealItem.id, itemId), eq(s.mealItem.userId, userId)));
  return Boolean(row);
}

/** 自分の記録にだけ写真を付けられる(他人の記録 ID なら null) */
export async function setMealPhoto(userId: string, itemId: string, data: Uint8Array, contentType: MealPhotoType) {
  if (!(await ownsItem(userId, itemId))) return null;
  const updatedAt = new Date();
  const buffer = Buffer.from(data);
  await db
    .insert(s.mealPhoto)
    .values({ mealItemId: itemId, userId, contentType, data: buffer, byteSize: buffer.length, updatedAt })
    .onConflictDoUpdate({
      target: s.mealPhoto.mealItemId,
      set: { contentType, data: buffer, byteSize: buffer.length, updatedAt },
    });
  return { url: mealPhotoUrl(itemId, updatedAt) };
}

export async function getMealPhoto(userId: string, itemId: string) {
  const [row] = await db
    .select({ data: s.mealPhoto.data, contentType: s.mealPhoto.contentType })
    .from(s.mealPhoto)
    .where(and(eq(s.mealPhoto.mealItemId, itemId), eq(s.mealPhoto.userId, userId)));
  return row ?? null;
}

export async function deleteMealPhoto(userId: string, itemId: string): Promise<boolean> {
  const res = await db
    .delete(s.mealPhoto)
    .where(and(eq(s.mealPhoto.mealItemId, itemId), eq(s.mealPhoto.userId, userId)))
    .returning({ id: s.mealPhoto.mealItemId });
  return res.length > 0;
}

/** 一覧に出す写真の URL(写真のない記録は含まない) */
export async function listMealPhotoUrls(userId: string, itemIds: string[]): Promise<Map<string, string>> {
  if (!itemIds.length) return new Map();
  const rows = await db
    .select({ id: s.mealPhoto.mealItemId, updatedAt: s.mealPhoto.updatedAt })
    .from(s.mealPhoto)
    .where(and(eq(s.mealPhoto.userId, userId), inArray(s.mealPhoto.mealItemId, itemIds)));
  return new Map(rows.map((r) => [r.id, mealPhotoUrl(r.id, r.updatedAt)]));
}

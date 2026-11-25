import "server-only";

import { and, desc, eq, like, or, sql } from "drizzle-orm";

import type { NutrientMap } from "@/domain/nutrients/types";
import { db } from "@/server/db/client";
import * as s from "@/server/db/schema";

export type MyProduct = typeof s.myProduct.$inferSelect;
export type MyProductInput = Omit<
  typeof s.myProduct.$inferInsert,
  "id" | "userId" | "useCount" | "lastUsedAt" | "createdAt"
> & { nutrientsJson: NutrientMap };

export async function listMyProducts(userId: string, query?: string, limit = 50): Promise<MyProduct[]> {
  const q = query?.trim();
  return db
    .select()
    .from(s.myProduct)
    .where(
      and(
        eq(s.myProduct.userId, userId),
        q ? or(like(s.myProduct.name, `%${q}%`), like(s.myProduct.brand, `%${q}%`)) : undefined,
      ),
    )
    .orderBy(desc(s.myProduct.useCount), desc(s.myProduct.lastUsedAt), desc(s.myProduct.createdAt))
    .limit(limit);
}

export async function getMyProduct(userId: string, id: string): Promise<MyProduct | null> {
  const [p] = await db
    .select()
    .from(s.myProduct)
    .where(and(eq(s.myProduct.userId, userId), eq(s.myProduct.id, id)));
  return p ?? null;
}

/** 同じ出典の同じ商品(OFF code / food_no)は重複保存せず更新する(§7.3) */
export async function saveMyProduct(userId: string, input: MyProductInput, id?: string): Promise<string> {
  if (id) {
    const res = await db
      .update(s.myProduct)
      // 編集したサンプルの商品は利用者の商品として扱う
      .set({ ...input, isSample: false })
      .where(and(eq(s.myProduct.id, id), eq(s.myProduct.userId, userId)))
      .returning({ id: s.myProduct.id });
    if (!res.length) throw new Error("not found");
    return res[0].id;
  }
  if (input.externalRef) {
    const [existing] = await db
      .select({ id: s.myProduct.id })
      .from(s.myProduct)
      .where(
        and(
          eq(s.myProduct.userId, userId),
          eq(s.myProduct.source, input.source),
          eq(s.myProduct.externalRef, input.externalRef),
        ),
      );
    if (existing) {
      await db
        .update(s.myProduct)
        .set({ ...input, isSample: false })
        .where(eq(s.myProduct.id, existing.id));
      return existing.id;
    }
  }
  const [row] = await db
    .insert(s.myProduct)
    .values({ ...input, userId })
    .returning({ id: s.myProduct.id });
  return row.id;
}

export async function touchMyProduct(userId: string, id: string) {
  await db
    .update(s.myProduct)
    .set({ useCount: sql`${s.myProduct.useCount} + 1`, lastUsedAt: new Date() })
    .where(and(eq(s.myProduct.id, id), eq(s.myProduct.userId, userId)));
}

export async function deleteMyProduct(userId: string, id: string) {
  const res = await db
    .delete(s.myProduct)
    .where(and(eq(s.myProduct.id, id), eq(s.myProduct.userId, userId)))
    .returning({ id: s.myProduct.id });
  return res.length > 0;
}

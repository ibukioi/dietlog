/**
 * 既存 DB の成分表に検索用の読みを入れる(ユーザーのデータには触らない)
 *
 *   pnpm db:migrate && pnpm tsx scripts/db/backfill-food-readings.ts
 */
import { config } from "dotenv";
import { eq } from "drizzle-orm";

import { createDb } from "../../src/server/db/create";
import * as s from "../../src/server/db/schema";
import { searchReadingOf } from "../../src/server/search/ja-reading";

config({ path: ".env.local" });

async function main() {
  const db = createDb({
    url: process.env.DATABASE_URL ?? "file:local.db",
    authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
  });
  const foods = await db.select({ foodNo: s.mextFood.foodNo, nameRaw: s.mextFood.nameRaw }).from(s.mextFood);
  const aliases = await db.select().from(s.mextFoodAlias);
  const byFood = new Map<string, string[]>();
  for (const a of aliases) byFood.set(a.foodNo, [...(byFood.get(a.foodNo) ?? []), a.alias]);
  const rows = await Promise.all(
    foods.map(async (f) => ({
      foodNo: f.foodNo,
      reading: await searchReadingOf([f.nameRaw, ...(byFood.get(f.foodNo) ?? [])]),
    })),
  );
  await db.transaction(async (tx) => {
    for (const r of rows) {
      await tx.update(s.mextFood).set({ searchReading: r.reading }).where(eq(s.mextFood.foodNo, r.foodNo));
    }
  });
  console.log(`✓ ${rows.length} 件の読みを更新`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Open Food Facts の人気検索語を事前に取得して、共有キャッシュに入れる(§7.2 ウォームアップ)
 *
 *   pnpm data:warm-off            # DATABASE_URL のキャッシュに入れる
 *
 * レート制限が厳しい(実測で約4回/分でも 503)ため、1 語ごとに 25 秒あけ、503 のときは待って再試行する。
 */
import { config } from "dotenv";
import { sql } from "drizzle-orm";

import { createDb } from "../../src/server/db/create";
import * as s from "../../src/server/db/schema";
import { normalizeOffProduct, normalizeOffQuery, offProductSchema } from "../../src/server/off/normalize";

config({ path: ".env.local" });

const TERMS = [
  "おにぎり",
  "サラダチキン",
  "カップヌードル",
  "ポテトチップス",
  "からあげクン",
  "ヨーグルト",
  "プロテイン",
  "食パン",
  "納豆",
  "豆腐",
  "サンドイッチ",
  "お茶",
  "コーヒー",
  "チョコレート",
  "アイス",
];
const SPACING_MS = 25_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchTerm(q: string, attempt = 1): Promise<unknown[] | null> {
  const url = new URL("https://world.openfoodfacts.org/cgi/search.pl");
  url.search = new URLSearchParams({
    search_terms: q,
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: "30",
    fields: "code,product_name,product_name_ja,brands,quantity,serving_size,countries_tags,nutriments",
  }).toString();
  const res = await fetch(url, { headers: { "User-Agent": process.env.OFF_USER_AGENT || "dietlog/0.1" } });
  if (res.status === 503 || res.status === 429) {
    if (attempt >= 4) return null;
    console.log(`  ${res.status} → ${attempt * 60} 秒待って再試行`);
    await sleep(attempt * 60_000);
    return fetchTerm(q, attempt + 1);
  }
  if (!res.ok) return null;
  const json = (await res.json()) as { products?: unknown[] };
  return json.products ?? [];
}

async function main() {
  const db = createDb({
    url: process.env.DATABASE_URL ?? "file:local.db",
    authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
  });
  for (const [i, term] of TERMS.entries()) {
    if (i > 0) await sleep(SPACING_MS);
    const raw = await fetchTerm(term);
    if (!raw) {
      console.log(`✗ ${term}: 取得できませんでした`);
      continue;
    }
    const codes: string[] = [];
    const fetchedAt = new Date();
    for (const r of raw) {
      const p = offProductSchema.safeParse(r);
      if (!p.success) continue;
      const cand = normalizeOffProduct(p.data);
      if (!cand) continue;
      codes.push(cand.code);
      await db
        .insert(s.offProductCache)
        .values({ offCode: cand.code, payloadJson: r, normalizedJson: cand, status: "found", fetchedAt })
        .onConflictDoUpdate({ target: s.offProductCache.offCode, set: { payloadJson: r, normalizedJson: cand, fetchedAt } });
    }
    await db
      .insert(s.offSearchCache)
      .values({ queryNorm: normalizeOffQuery(term), codesJson: codes, fetchedAt })
      .onConflictDoUpdate({ target: s.offSearchCache.queryNorm, set: { codesJson: codes, fetchedAt } });
    console.log(`✓ ${term}: ${codes.length} 件`);
  }
  const [{ n }] = await db.all<{ n: number }>(sql`select count(*) as n from off_search_cache`);
  console.log(`キャッシュ済みの検索語: ${n}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

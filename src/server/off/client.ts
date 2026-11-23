import "server-only";

import { and, eq, gt, inArray } from "drizzle-orm";
import { z } from "zod";

import { katakanaToHiragana } from "@/lib/ja-normalize";
import { db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { toReading } from "@/server/search/ja-reading";
import { isCircuitOpen, openCircuit, takeToken } from "@/server/services/rate-limit";

import { type OffCandidate, normalizeOffProduct, normalizeOffQuery, offProductSchema } from "./normalize";

/**
 * Open Food Facts のキーワード検索(§7.2)
 * - 旧検索 API(cgi/search.pl): 日本語の検索精度が実用的。新検索 API は日本語で当たらないため使わない
 * - 全ユーザー共有の DB キャッシュ(検索 7 日 / 商品 30 日)
 * - 外向きはアプリ全体で 3 回/分。503 を受けたら 60 秒止める(サーキットブレーカー)
 */
const SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl";
const FIELDS = "code,product_name,product_name_ja,brands,quantity,serving_size,countries_tags,nutriments";
const SEARCH_TTL = 7 * 86_400_000;
const PRODUCT_TTL = 30 * 86_400_000;
const GLOBAL_LIMIT_PER_MIN = 3;
const CIRCUIT_MS = 60_000;
const TIMEOUT_MS = 3_000;

export type OffSearchResult =
  | { status: "ok"; source: "cache" | "live"; products: OffCandidate[] }
  | { status: "busy" | "unavailable"; message: string };

async function readCache(queryNorm: string, now: number): Promise<OffCandidate[] | null> {
  const [hit] = await db
    .select()
    .from(s.offSearchCache)
    .where(and(eq(s.offSearchCache.queryNorm, queryNorm), gt(s.offSearchCache.fetchedAt, new Date(now - SEARCH_TTL))));
  if (!hit) return null;
  if (hit.codesJson.length === 0) return [];
  const rows = await db.select().from(s.offProductCache).where(inArray(s.offProductCache.offCode, hit.codesJson));
  const byCode = new Map(rows.map((r) => [r.offCode, r.normalizedJson as OffCandidate | null]));
  return hit.codesJson.map((c) => byCode.get(c)).filter((x): x is OffCandidate => Boolean(x));
}

/**
 * OFF は読みを理解しないので、見つからないときだけ別の表記でも探す。
 * 例: 「手羽先」→「てばさき」「テバサキ」、「おにぎり」→「オニギリ」
 */
export async function searchOff(query: string, now = Date.now()): Promise<OffSearchResult> {
  const q = query.normalize("NFKC").trim().slice(0, 60);
  if (!q) return { status: "ok", source: "cache", products: [] };
  const first = await searchOffOnce(q, normalizeOffQuery(q), now);
  if (first.status !== "ok" || first.products.length > 0) return first;

  const hira = katakanaToHiragana(await toReading(q));
  const kata = hira.replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
  for (const variant of new Set([hira, kata])) {
    if (!variant || variant === q) continue;
    // ひらがなとカタカナは通常のキーだと同じになるので、表記ごとに別のキーで保存する
    const res = await searchOffOnce(variant, `variant:${variant}`, now);
    if (res.status !== "ok" || res.products.length > 0) return res;
  }
  return first;
}

async function searchOffOnce(q: string, key: string, now: number): Promise<OffSearchResult> {
  const cached = await readCache(key, now);
  if (cached) return { status: "ok", source: "cache", products: cached };

  if (await isCircuitOpen("off", now)) {
    return { status: "unavailable", message: "Open Food Facts に接続できません。少し待つか、手入力で記録できます。" };
  }
  if (!(await takeToken("off_search_global", GLOBAL_LIMIT_PER_MIN, 60_000, now))) {
    return { status: "busy", message: "混み合っています。数秒後に再検索するか、手入力をご利用ください。" };
  }

  const url = new URL(SEARCH_URL);
  url.search = new URLSearchParams({
    search_terms: q,
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: "30",
    fields: FIELDS,
  }).toString();

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": process.env.OFF_USER_AGENT || "dietlog/0.1" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    await openCircuit("off", CIRCUIT_MS, now);
    return { status: "unavailable", message: "Open Food Facts に接続できません。少し待つか、手入力で記録できます。" };
  }
  if (res.status === 503 || res.status === 429 || !res.ok) {
    await openCircuit("off", CIRCUIT_MS, now);
    return { status: "unavailable", message: "Open Food Facts が混み合っています。少し待つか、手入力で記録できます。" };
  }
  const body = z.object({ products: z.array(z.unknown()).default([]) }).safeParse(await res.json().catch(() => null));
  if (!body.success) {
    return { status: "unavailable", message: "Open Food Facts の応答を読み取れませんでした。手入力で記録できます。" };
  }

  const products: OffCandidate[] = [];
  const fetchedAt = new Date(now);
  for (const raw of body.data.products) {
    const parsed = offProductSchema.safeParse(raw);
    if (!parsed.success) continue;
    const cand = normalizeOffProduct(parsed.data);
    if (!cand) continue;
    products.push(cand);
    // 生データは改変せずに保持(ODbL: 派生データの範囲を明確にする §7.4)
    await db
      .insert(s.offProductCache)
      .values({ offCode: cand.code, payloadJson: raw, normalizedJson: cand, status: "found", fetchedAt })
      .onConflictDoUpdate({
        target: s.offProductCache.offCode,
        set: { payloadJson: raw, normalizedJson: cand, status: "found", fetchedAt },
      });
  }
  await db
    .insert(s.offSearchCache)
    .values({ queryNorm: key, codesJson: products.map((p) => p.code), fetchedAt })
    .onConflictDoUpdate({
      target: s.offSearchCache.queryNorm,
      set: { codesJson: products.map((p) => p.code), fetchedAt },
    });
  return { status: "ok", source: "live", products };
}

export async function getCachedOffProduct(code: string): Promise<OffCandidate | null> {
  const [row] = await db
    .select()
    .from(s.offProductCache)
    .where(
      and(eq(s.offProductCache.offCode, code), gt(s.offProductCache.fetchedAt, new Date(Date.now() - PRODUCT_TTL))),
    );
  return (row?.normalizedJson as OffCandidate | undefined) ?? null;
}

/**
 * Open Food Facts のレスポンスを INFOODS キーの成分に正規化する(§7.2)
 * - キーが無い成分は null(不明)。0 にしない
 * - 単位: OFF の *_100g は g 基準(ミネラル・ビタミンも g)。成分表の単位に換算する
 */
import { z } from "zod";

import type { NutrientMap } from "@/domain/nutrients/types";

const num = z.preprocess(
  (v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v),
  z.number().finite().nonnegative(),
);

export const offProductSchema = z
  .object({
    code: z.string(),
    product_name: z.string().optional().nullable(),
    product_name_ja: z.string().optional().nullable(),
    brands: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .nullable(),
    quantity: z.string().optional().nullable(),
    serving_size: z.string().optional().nullable(),
    countries_tags: z.array(z.string()).optional().nullable(),
    nutriments: z.record(z.string(), z.unknown()).optional().nullable(),
  })
  .passthrough();

export type OffProduct = z.infer<typeof offProductSchema>;

// OFF のキー → [成分識別子, 倍率(OFF の値 → 成分表の単位)]
const MAP: Record<string, [string, number]> = {
  "energy-kcal_100g": ["ENERC_KCAL", 1],
  proteins_100g: ["PROT-", 1],
  fat_100g: ["FAT-", 1],
  carbohydrates_100g: ["CHOCDF-", 1],
  salt_100g: ["NACL_EQ", 1],
  fiber_100g: ["FIB-", 1],
  sodium_100g: ["NA", 1000],
  potassium_100g: ["K", 1000],
  calcium_100g: ["CA", 1000],
  magnesium_100g: ["MG", 1000],
  iron_100g: ["FE", 1000],
  zinc_100g: ["ZN", 1000],
  "vitamin-a_100g": ["VITA_RAE", 1_000_000],
  "vitamin-d_100g": ["VITD", 1_000_000],
  "vitamin-e_100g": ["TOCPHA", 1000],
  "vitamin-k_100g": ["VITK", 1_000_000],
  "vitamin-b1_100g": ["THIA", 1000],
  "vitamin-b2_100g": ["RIBF", 1000],
  "vitamin-b6_100g": ["VITB6A", 1000],
  "vitamin-b12_100g": ["VITB12", 1_000_000],
  "vitamin-c_100g": ["VITC", 1000],
  folates_100g: ["FOL", 1_000_000],
  cholesterol_100g: ["CHOLE", 1000],
};

export interface OffCandidate {
  code: string;
  name: string;
  brand: string | null;
  quantity: string | null;
  servingSize: string | null;
  per100g: NutrientMap;
  /** 主要 5 項目のうち欠けている数 */
  missingCore: number;
  /** 妥当性チェックで気になる点 */
  warnings: string[];
}

const CORE_CODES = ["ENERC_KCAL", "PROT-", "FAT-", "CHOCDF-", "NACL_EQ"];

export function normalizeOffProduct(p: OffProduct): OffCandidate | null {
  const name = (p.product_name_ja || p.product_name || "").trim();
  if (!name) return null;
  const nm = p.nutriments ?? {};
  const per100g: NutrientMap = {};
  for (const code of CORE_CODES) per100g[code] = null;
  for (const [key, [code, factor]] of Object.entries(MAP)) {
    const parsed = num.safeParse(nm[key]);
    if (parsed.success) per100g[code] = Math.round(parsed.data * factor * 1000) / 1000;
  }
  // 食塩相当量がなくナトリウムがあれば換算(食塩相当量 = Na(g) × 2.54)
  if (per100g.NACL_EQ === null && typeof per100g.NA === "number") {
    per100g.NACL_EQ = Math.round(((per100g.NA as number) / 1000) * 2.54 * 100) / 100;
  }

  const warnings: string[] = [];
  const kcal = per100g.ENERC_KCAL;
  const p_ = per100g["PROT-"];
  const f = per100g["FAT-"];
  const c = per100g["CHOCDF-"];
  if (typeof kcal === "number" && typeof p_ === "number" && typeof f === "number" && typeof c === "number") {
    const est = p_ * 4 + f * 9 + c * 4;
    if (est > 20 && Math.abs(est - kcal) / est > 0.3)
      warnings.push("エネルギーと PFC の値が合っていない可能性があります");
  }
  const sugars = num.safeParse(nm["sugars_100g"]);
  if (sugars.success && typeof c === "number" && sugars.data > c + 0.5)
    warnings.push("糖類が炭水化物より多く記載されています");

  // 新しい検索 API はブランドに言語の接頭辞(例: "xx:伊藤ハム")が付くので外す
  const rawBrand = Array.isArray(p.brands) ? p.brands[0] : (p.brands?.split(",")[0] ?? null);
  const brand = rawBrand?.replace(/^[a-z]{2,3}:/, "") ?? null;
  return {
    code: p.code,
    name,
    brand: brand?.trim() || null,
    quantity: p.quantity ?? null,
    servingSize: p.serving_size ?? null,
    per100g,
    missingCore: CORE_CODES.filter((k) => per100g[k] === null).length,
    warnings,
  };
}

/** 検索語の正規化(キャッシュキー用): NFKC・空白除去・カタカナ統一 */
export function normalizeOffQuery(q: string): string {
  return q
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　]+/g, " ")
    .trim()
    .replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
}

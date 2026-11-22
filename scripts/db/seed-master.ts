/**
 * マスタデータ(成分表・調理対応・後備係数・食事摂取基準・同義語)を DB に投入する。
 * 何度実行しても同じ結果になる(既存のマスタを消してから入れ直す)。
 *
 *   pnpm db:seed
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "dotenv";
import { sql } from "drizzle-orm";

import { createDb } from "../../src/server/db/create";
import * as s from "../../src/server/db/schema";
import { NUTRIENTS, NUTRIENT_CODES } from "../../src/domain/nutrients/catalog";
import { parseMextValue } from "../../src/domain/mext/parse-value";
import { COOKING_METHODS } from "../../src/domain/mext/cooking";
import { displayNameFromMext, normalizeJa } from "../../src/lib/ja-normalize";

config({ path: ".env.local" });

const ROOT = process.cwd();
const readJson = async <T>(p: string): Promise<T> => JSON.parse(await readFile(path.join(ROOT, p), "utf8")) as T;

type FoodJson = {
  foodNo: string;
  indexNo: string;
  groupCode: string;
  nameRaw: string;
  refuse: string;
  note: string;
  density: number | null;
  cookingMethod: string | null;
  values: Record<string, string>;
};

export const MEXT_DATASET_ID = "mext-8th-2023-20260327";
export const DRI_DATASET_ID = "dri-2025";

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

async function main() {
  const db = createDb({
    url: process.env.DATABASE_URL ?? "file:local.db",
    authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
  });

  const meta = await readJson<{ dataUpdated: string; files: { main: { sha256: string } } }>("data/mext/meta.json");
  const foods = await readJson<FoodJson[]>("data/mext/foods.json");
  const variants = await readJson<Array<typeof s.mextCookedVariant.$inferInsert>>("data/mext/cooked-variants.json");
  const coefficients = await readJson<Array<typeof s.cookingCoefficient.$inferInsert>>(
    "data/mext/cooking-coefficients.json",
  );
  const dri = await readJson<{
    values: Array<{
      nutrientCode: string;
      sex: "male" | "female";
      ageMin: number;
      ageMax: number;
      variant: string | null;
      ear: number | null;
      rda: number | null;
      ai: number | null;
      dgLower: number | null;
      dgUpper: number | null;
      ul: number | null;
      sourceRef: string;
    }>;
  }>("data/dri/dri-2025.json");
  const aliasRules = (await readJson<{ aliases: [string, string][] }>("data/manual/aliases.json")).aliases;
  const popular = new Set((await readJson<{ foodNos: string[] }>("data/manual/popular.json")).foodNos);

  // 依存の逆順で削除
  for (const t of [
    s.mextFoodAlias,
    s.mextFoodNutrient,
    s.mextCookedVariant,
    s.cookingCoefficient,
    s.mextFood,
    s.cookingMethod,
    s.nutrient,
    s.driValue,
    s.datasetVersion,
  ]) {
    await db.delete(t);
  }

  await db.insert(s.datasetVersion).values([
    {
      id: MEXT_DATASET_ID,
      source: "mext",
      title: "日本食品標準成分表（八訂）増補2023年",
      versionLabel: `データ更新日 ${meta.dataUpdated} / 正誤表 令和8年3月27日`,
      publishedOn: "2023-04-28",
      errataOn: "2026-03-27",
      fileSha256: meta.files.main.sha256,
    },
    {
      id: DRI_DATASET_ID,
      source: "dri",
      title: "日本人の食事摂取基準（2025年版）",
      versionLabel: "策定検討会報告書(正誤表 令和7年3月25日 確認済み)",
      publishedOn: "2024-10-11",
      errataOn: "2025-03-25",
    },
  ]);

  await db.insert(s.nutrient).values(
    NUTRIENTS.map((n, i) => ({
      code: n.code,
      nameJa: n.nameJa,
      unit: n.unit,
      category: n.category,
      displayOrder: i,
    })),
  );

  await db.insert(s.cookingMethod).values(
    COOKING_METHODS.map((m, i) => ({
      code: m.code,
      nameJa: m.nameJa,
      mextKeywords: [...m.keywords],
      usesOil: m.usesOil,
      displayOrder: i,
    })),
  );

  // 同義語: name_contains を含む食品に別名を付ける
  const aliasesByFood = new Map<string, string[]>();
  for (const f of foods) {
    for (const [alias, contains] of aliasRules) {
      if (f.nameRaw.includes(contains)) {
        const xs = aliasesByFood.get(f.foodNo) ?? [];
        xs.push(alias);
        aliasesByFood.set(f.foodNo, xs);
      }
    }
  }

  const foodRows = foods.map((f) => {
    const refuse = parseMextValue(f.refuse).value;
    const aliases = aliasesByFood.get(f.foodNo) ?? [];
    return {
      foodNo: f.foodNo,
      indexNo: f.indexNo,
      groupCode: f.groupCode,
      nameRaw: f.nameRaw,
      nameDisplay: displayNameFromMext(f.nameRaw),
      searchText: normalizeJa([f.nameRaw, ...aliases].join(" ")),
      refuseRate: refuse,
      isCooked: f.cookingMethod !== null,
      cookingMethodCode: f.cookingMethod,
      isDish: f.groupCode === "18" || f.groupCode === "15" || f.cookingMethod !== null,
      densityGPerMl: f.density,
      popularity: popular.has(f.foodNo) ? 10 : 0,
      note: f.note || null,
      datasetVersionId: MEXT_DATASET_ID,
    };
  });
  for (const c of chunk(foodRows, 200)) await db.insert(s.mextFood).values(c);

  const nutrientRows = foods.flatMap((f) =>
    NUTRIENT_CODES.filter((c) => c !== "ENERC").map((code) => {
      const p = parseMextValue(f.values[code]);
      return { foodNo: f.foodNo, nutrientCode: code, value: p.value, flag: p.flag, rawText: p.raw || null };
    }),
  );
  await db.transaction(async (tx) => {
    for (const c of chunk(nutrientRows, 1000)) await tx.insert(s.mextFoodNutrient).values(c);
  });

  const aliasRows = [...aliasesByFood.entries()].flatMap(([foodNo, xs]) =>
    [...new Set(xs)].map((alias) => ({ foodNo, alias: normalizeJa(alias) })),
  );
  for (const c of chunk(aliasRows, 500)) await db.insert(s.mextFoodAlias).values(c).onConflictDoNothing();

  for (const c of chunk(variants, 200)) await db.insert(s.mextCookedVariant).values(c);
  await db.insert(s.cookingCoefficient).values(coefficients);

  await db.insert(s.driValue).values(
    dri.values.map((v) => ({
      driVersion: "2025",
      nutrientCode: v.nutrientCode,
      sex: v.sex,
      ageMin: v.ageMin,
      ageMax: v.ageMax,
      lifeStage: v.variant ?? "none",
      ear: v.ear,
      rda: v.rda,
      ai: v.ai,
      dgLower: v.dgLower,
      dgUpper: v.dgUpper,
      ul: v.ul,
      sourceRef: v.sourceRef,
    })),
  );

  const [{ n }] = await db.all<{ n: number }>(sql`select count(*) as n from mext_food_nutrient`);
  console.log(
    `✓ seeded: foods=${foodRows.length} nutrients=${n} variants=${variants.length} coefficients=${coefficients.length} dri=${dri.values.length} aliases=${aliasRows.length}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

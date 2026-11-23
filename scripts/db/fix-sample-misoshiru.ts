/**
 * サンプルのタグ「豆腐とわかめの味噌汁」の調理法を「生」から「汁ごと食べる」に直す(一度だけ実行するデータ修正)
 *
 *   pnpm tsx scripts/db/fix-sample-misoshiru.ts
 *
 * - お試しモードのサンプル(data/seed/guest-template.json)は修正済み。これは修正前に作られたアカウント用
 * - 対象: タグ名「豆腐とわかめの味噌汁」の材料のうち、木綿豆腐(04032)・カットわかめ 乾(09044)で調理法が raw のもの
 * - 記録済みの食事の計算内訳(calc_trace_json.specs)も同じように直す。
 *   汁ごと食べる場合も調理前の成分値で計算するので、栄養値は変わらない
 */
import { config } from "dotenv";
import { and, eq, inArray } from "drizzle-orm";

import { createDb } from "../../src/server/db/create";
import * as s from "../../src/server/db/schema";

config({ path: ".env.local" });

const RECIPE_NAME = "豆腐とわかめの味噌汁";
const FOOD_NOS = ["04032", "09044"];

async function main() {
  const db = createDb({
    url: process.env.DATABASE_URL ?? "file:local.db",
    authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
  });

  const recipes = await db.select({ id: s.recipe.id }).from(s.recipe).where(eq(s.recipe.name, RECIPE_NAME));
  const recipeIds = recipes.map((r) => r.id);
  let ingredientRows = 0;
  if (recipeIds.length) {
    const res = await db
      .update(s.recipeIngredient)
      .set({ cookingMethodCode: "soup" })
      .where(
        and(
          inArray(s.recipeIngredient.recipeId, recipeIds),
          inArray(s.recipeIngredient.foodNo, FOOD_NOS),
          eq(s.recipeIngredient.role, "ingredient"),
          eq(s.recipeIngredient.cookingMethodCode, "raw"),
        ),
      )
      .returning({ id: s.recipeIngredient.id });
    ingredientRows = res.length;
  }

  // 記録済みの食事: 計算内訳に残した材料(specs)の調理法を直す
  const items = await db
    .select({ id: s.mealItem.id, trace: s.mealItem.calcTraceJson })
    .from(s.mealItem)
    .where(and(eq(s.mealItem.kind, "home_cooked"), eq(s.mealItem.nameSnapshot, RECIPE_NAME)));
  let traces = 0;
  for (const it of items) {
    const trace = it.trace as { specs?: Array<{ role: string; foodNo: string; method: string }> } | null;
    if (!trace?.specs) continue;
    let changed = false;
    const specs = trace.specs.map((sp) => {
      if (sp.role === "ingredient" && FOOD_NOS.includes(sp.foodNo) && sp.method === "raw") {
        changed = true;
        return { ...sp, method: "soup" };
      }
      return sp;
    });
    if (!changed) continue;
    await db
      .update(s.mealItem)
      .set({ calcTraceJson: { ...trace, specs } })
      .where(eq(s.mealItem.id, it.id));
    traces += 1;
  }

  console.log(`✓ タグ ${recipeIds.length} 件の材料 ${ingredientRows} 行、記録 ${traces} 件を「汁ごと食べる」に修正`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

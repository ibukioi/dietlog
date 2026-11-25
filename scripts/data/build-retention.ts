/**
 * 調理による栄養素の残存率を作る(data/mext/retention-factors.json)
 *
 *   pnpm data:retention
 *
 * 入力はリポジトリにある data/mext/foods.json と cooked-variants.json だけ(成分表の再取得は不要)。
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parseMextValue } from "../../src/domain/mext/parse-value";
import { type CookingMethodCode } from "../../src/domain/mext/cooking";
import {
  RETENTION_CODES,
  RETENTION_EXCLUDED_METHODS,
  RETENTION_MIN_SAMPLES,
  type RetentionPair,
  computeRetentionFactors,
} from "../../src/domain/mext/retention";

const ROOT = path.resolve(__dirname, "../..");
const read = async <T>(p: string): Promise<T> => JSON.parse(await readFile(path.join(ROOT, p), "utf8")) as T;

interface FoodJson {
  foodNo: string;
  groupCode: string;
  values: Record<string, unknown>;
}
interface VariantJson {
  rawFoodNo: string;
  cookedFoodNo: string;
  cookingMethodCode: CookingMethodCode;
  weightChangeRate: number | null;
}

/** 微量(Tr)・推定ゼロ・未測定は比が意味をなさないので null */
function valuesOf(f: FoodJson, side: "raw" | "cooked") {
  const out: Record<string, number | null> = {};
  for (const code of RETENTION_CODES) {
    const v = parseMextValue(f.values[code]);
    const usable = side === "raw" ? v.flag === "measured" || v.flag === "estimated" : v.value !== null;
    out[code] = usable ? v.value : null;
  }
  return out;
}

async function main() {
  const foods = new Map((await read<FoodJson[]>("data/mext/foods.json")).map((f) => [f.foodNo, f]));
  const variants = await read<VariantJson[]>("data/mext/cooked-variants.json");
  const pairs: RetentionPair[] = [];
  for (const v of variants) {
    const raw = foods.get(v.rawFoodNo);
    const cooked = foods.get(v.cookedFoodNo);
    if (!raw || !cooked || !v.weightChangeRate) continue;
    pairs.push({
      method: v.cookingMethodCode,
      group: raw.groupCode,
      weightChangeRate: v.weightChangeRate,
      raw: valuesOf(raw, "raw"),
      cooked: valuesOf(cooked, "cooked"),
    });
  }
  const entries = computeRetentionFactors(pairs);
  const out = {
    $comment:
      "調理による栄養素の残存率(真の残存率 = 調理後の含量 × 重量変化率 / 100 ÷ 生の含量)の中央値。成分表の調理前後の対応から算出。100% を上限とする",
    minSamples: RETENTION_MIN_SAMPLES,
    excludedMethods: [...RETENTION_EXCLUDED_METHODS],
    pairs: pairs.length,
    entries,
  };
  await writeFile(path.join(ROOT, "data/mext/retention-factors.json"), JSON.stringify(out, null, 1) + "\n");
  console.log(`✓ 残存率: ${entries.length} 区分(対応 ${pairs.length} 件)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

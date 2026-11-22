/**
 * 成分表 Excel を正規化して data/mext/*.json を作る(§7.1 parse → normalize → verify errata)
 *
 *   pnpm data:download   # data/raw/ に公式ファイルを取得
 *   pnpm data:build      # このスクリプト
 *
 * 出力(リポジトリにコミットする。出典は data/README.md に記載):
 *   data/mext/meta.json               取り込み元・ハッシュ・正誤照合結果
 *   data/mext/foods.json              2,538 食品 × 成分識別子(収載値の原文表記)
 *   data/mext/cooked-variants.json    生食品 × 調理法 → 調理後食品・重量変化率(表12)
 *   data/mext/cooking-coefficients.json 調理法 × 食品群の後備係数(重量変化率・吸油量の中央値)
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";

import { NUTRIENT_CODES } from "../../src/domain/nutrients/catalog";
import { parseMextValue, sameMextValue } from "../../src/domain/mext/parse-value";
import {
  COOKING_METHODS,
  OIL_METHODS,
  detectCookingMethod,
  median,
  nameTokens,
  rawNameCandidates,
  type CookingMethodCode,
} from "../../src/domain/mext/cooking";

const ROOT = process.cwd();
const RAW = path.join(ROOT, "data", "raw");
const OUT = path.join(ROOT, "data", "mext");

export interface MextFoodRecord {
  foodNo: string;
  indexNo: string;
  groupCode: string;
  nameRaw: string;
  refuse: string;
  note: string;
  /** 成分識別子 → 収載値の原文(例 "(1.2)", "Tr", "-") */
  values: Record<string, string>;
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("result" in v) return String(v.result ?? "");
    if ("text" in v) return String(v.text);
  }
  return String(v);
}

function rowValues(row: ExcelJS.Row, width: number): string[] {
  const out: string[] = [];
  for (let c = 1; c <= width; c++) out.push(cellText(row.getCell(c).value).trim());
  return out;
}

async function readMain(file: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  const width = ws.columnCount;

  let headerRow = -1;
  let ids: string[] = [];
  ws.eachRow((row, n) => {
    const vals = rowValues(row, width);
    if (headerRow < 0 && vals.includes("成分識別子")) {
      headerRow = n;
      ids = vals;
    }
  });
  if (headerRow < 0) throw new Error("成分識別子の行が見つかりません");

  // 成分識別子の列。マーカー列(*)は識別子が空なので除外される
  const col: Record<string, number> = {};
  ids.forEach((id, i) => {
    const code = id.trim();
    if (code && code !== "成分識別子") col[code] = i;
  });
  for (const code of NUTRIENT_CODES) {
    if (!(code in col)) throw new Error(`列が見つかりません: ${code}`);
  }
  // 備考列: ヘッダー部の「備　　考」セルの列
  let noteCol = -1;
  for (let r = 1; r < headerRow && noteCol < 0; r++) {
    const vals = rowValues(ws.getRow(r), width);
    noteCol = vals.findIndex((v) => v.replace(/[\s　]/g, "") === "備考");
  }
  if (noteCol < 0) throw new Error("備考列が見つかりません");
  const updated =
    rowValues(ws.getRow(1), width)
      .find((v) => v.includes("更新日"))
      ?.replace(/^更新日[：:]\s*/, "") ?? "";

  const foods: MextFoodRecord[] = [];
  ws.eachRow((row, n) => {
    if (n <= headerRow) return;
    const v = rowValues(row, width);
    if (!/^\d{5}$/.test(v[1])) return;
    const values: Record<string, string> = {};
    for (const code of NUTRIENT_CODES) values[code] = v[col[code]];
    foods.push({
      foodNo: v[1],
      indexNo: v[2],
      groupCode: v[0].padStart(2, "0"),
      nameRaw: v[3],
      refuse: v[col.REFUSE],
      note: v[noteCol] ?? "",
      values,
    });
  });
  return { foods, updated, col };
}

// 正誤表「本表第2章」の項目名 → 成分識別子
const ERRATA_LABEL_TO_CODE: Record<string, string> = {
  "エネルギーkJ": "ENERC",
  "エネルギーkcal": "ENERC_KCAL",
  "食物繊維総量": "FIB-",
  "ナイアシン当量": "NE",
  "レチノール活性当量": "VITA_RAE",
  "利用可能炭水化物（単糖当量）": "CHOAVLM",
  "利用可能炭水化物（質量計）": "CHOAVL",
  "利用可能炭水化物（差引き法による利用可能炭水化物）": "CHOAVLDF-",
  "差引き法による利用可能炭水化物": "CHOAVLDF-",
  "炭水化物": "CHOCDF-",
  "糖アルコール": "POLYL",
  "βクリプトキサンチン": "CRYPXB",
  "ビオチン": "BIOT",
};

interface ErrataCheck {
  checked: number;
  matched: number;
  overwritten: Array<{ foodNo: string; code: string; excel: string; correct: string }>;
  skipped: number;
}

async function verifyErrata(file: string, foods: MextFoodRecord[], mainCol: Record<string, number>) {
  const byNo = new Map(foods.map((f) => [f.foodNo, f]));
  const result: ErrataCheck = { checked: 0, matched: 0, overwritten: [], skipped: 0 };
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);

  const apply = (foodNo: string, code: string, correct: string) => {
    const food = byNo.get(foodNo);
    if (!food) return;
    result.checked += 1;
    if (sameMextValue(food.values[code], correct)) {
      result.matched += 1;
    } else {
      result.overwritten.push({ foodNo, code, excel: food.values[code], correct });
      food.values[code] = correct;
    }
  };

  // (1) 項目単位の正誤(本表第2章)
  const item = wb.getWorksheet("本表第2章");
  if (item) {
    const width = item.columnCount;
    let header: string[] = [];
    item.eachRow((row) => {
      const v = rowValues(row, width);
      if (v.includes("項目等")) {
        header = v;
        return;
      }
      if (!header.length) return;
      const foodNo = v[header.indexOf("食品番号")];
      const label = v[header.indexOf("項目等")].replace(/[\s　]/g, "").replace(/アスタリスク$/, "");
      const correct = v[header.indexOf("正")];
      const code = ERRATA_LABEL_TO_CODE[label];
      if (!/^\d{5}$/.test(foodNo) || !code || !correct || correct.startsWith("シート")) {
        if (/^\d{5}$/.test(foodNo)) result.skipped += 1;
        return;
      }
      apply(foodNo, code, correct);
    });
  }

  // (2) 行単位の正誤(本表: 「誤」「正」の行が並ぶ。列は本表と同じ並び)
  const rows = wb.getWorksheet("本表");
  if (rows) {
    const width = rows.columnCount;
    rows.eachRow((row) => {
      const v = rowValues(row, width);
      if (v[0] !== "正" || !/^\d{5}$/.test(v[2])) return;
      // 本表シートは先頭に「誤/正」列が 1 つ多い
      for (const code of NUTRIENT_CODES) {
        const correct = v[mainCol[code] + 1];
        if (correct !== undefined && correct !== "") apply(v[2], code, correct);
      }
    });
  }
  return result;
}

function densityFromNote(note: string): number | null {
  // 例: "(100 g：80.0mL、100 mL：125.0g)"
  const m = /100\s*mL[：:]\s*([\d.]+)\s*g/.exec(note.normalize("NFKC"));
  return m ? Number(m[1]) / 100 : null;
}

async function readTable12(): Promise<Map<string, number>> {
  const csv = await readFile(path.join(ROOT, "data", "manual", "table12_weight_change.csv"), "utf8");
  const map = new Map<string, number>();
  for (const line of csv.trim().split("\n").slice(1)) {
    const [foodNo, rate] = line.split(",");
    const n = Number(rate);
    if (/^\d{5}$/.test(foodNo) && Number.isFinite(n) && n > 0) map.set(foodNo, n);
  }
  return map;
}

function num(raw: string): number | null {
  try {
    return parseMextValue(raw).value;
  } catch {
    return null;
  }
}

async function main() {
  const manifest = JSON.parse(await readFile(path.join(RAW, "manifest.json"), "utf8"));
  const { foods, updated, col } = await readMain(path.join(RAW, "mext_main.xlsx"));
  if (foods.length !== 2538) console.warn(`⚠ 食品数が想定(2,538)と異なります: ${foods.length}`);

  // 全セルが解釈できることを確認
  let bad = 0;
  for (const f of foods)
    for (const [code, raw] of Object.entries(f.values)) {
      try {
        parseMextValue(raw);
      } catch {
        bad += 1;
        console.warn(`解釈できない値 ${f.foodNo} ${code}: "${raw}"`);
      }
    }
  if (bad) throw new Error(`解釈できない値が ${bad} 件あります`);

  const errata = await verifyErrata(path.join(RAW, "mext_errata.xlsx"), foods, col);

  // 調理後食品 → 生食品の対応(表12 の重量変化率がある食品のみ)
  const table12 = await readTable12();
  const byName = new Map(foods.map((f) => [nameTokens(f.nameRaw).join("　"), f]));
  const byNo = new Map(foods.map((f) => [f.foodNo, f]));
  const variants: Array<{
    rawFoodNo: string;
    cookingMethodCode: CookingMethodCode;
    cookedFoodNo: string;
    weightChangeRate: number;
    includesOil: boolean;
    source: string;
  }> = [];
  const unmatched: string[] = [];
  for (const f of foods) {
    const method = detectCookingMethod(f.nameRaw);
    const rate = table12.get(f.foodNo);
    if (!method || rate === undefined) continue;
    let raw = rawNameCandidates(f.nameRaw)
      .map((n) => byName.get(n))
      .find((r) => r && r.foodNo !== f.foodNo && !detectCookingMethod(r.nameRaw));
    if (!raw) {
      // 例: "角形食パン　焼き" → "角形食パン　食パン"。同じ接頭辞 + 1 トークンの未調理食品が 1 件だけなら対応づける
      const base = nameTokens(f.nameRaw).slice(0, -1);
      const prefix = base.join("　") + "　";
      const hits = foods.filter(
        (r) =>
          r.groupCode === f.groupCode &&
          !detectCookingMethod(r.nameRaw) &&
          r.nameRaw.startsWith(prefix) &&
          nameTokens(r.nameRaw).length === base.length + 1,
      );
      if (hits.length === 1) raw = hits[0];
    }
    if (!raw) {
      unmatched.push(`${f.foodNo} ${f.nameRaw}`);
      continue;
    }
    variants.push({
      rawFoodNo: raw.foodNo,
      cookingMethodCode: method,
      cookedFoodNo: f.foodNo,
      weightChangeRate: rate,
      includesOil: OIL_METHODS.has(method),
      source: "表12(重量変化率)・食品名の対応",
    });
  }

  // 後備係数: 調理法 × 食品群 の中央値(重量変化率、生100 gあたりの脂質増加量 = 吸油量)
  type Acc = { rates: number[]; oil: number[] };
  const acc = new Map<string, Acc>();
  const push = (key: string, rate: number, oil: number | null) => {
    const a = acc.get(key) ?? { rates: [], oil: [] };
    a.rates.push(rate);
    if (oil !== null) a.oil.push(oil);
    acc.set(key, a);
  };
  for (const v of variants) {
    const raw = byNo.get(v.rawFoodNo)!;
    const cooked = byNo.get(v.cookedFoodNo)!;
    const fatRaw = num(raw.values["FAT-"]);
    const fatCooked = num(cooked.values["FAT-"]);
    const oil =
      v.includesOil && fatRaw !== null && fatCooked !== null
        ? Math.max(0, (fatCooked * v.weightChangeRate) / 100 - fatRaw)
        : null;
    push(`${v.cookingMethodCode}|${raw.groupCode}`, v.weightChangeRate, oil);
    push(`${v.cookingMethodCode}|*`, v.weightChangeRate, oil);
  }
  const coefficients = [...acc.entries()].map(([key, a]) => {
    const [method, group] = key.split("|");
    return {
      cookingMethodCode: method,
      foodCategory: group,
      weightChangeRate: Math.round(median(a.rates)!),
      oilAbsorptionPct: OIL_METHODS.has(method) ? Number((median(a.oil) ?? 0).toFixed(1)) : 0,
      basis:
        group === "*"
          ? "表12の重量変化率と調理前後の脂質から算出した全食品群の中央値"
          : `表12の重量変化率と調理前後の脂質から算出した食品群${group}の中央値`,
      sampleSize: a.rates.length,
    };
  });
  // 表12 に例がない調理法の既定値(炒め油は表14の条件「生の材料に対し植物油5%」)
  for (const m of COOKING_METHODS) {
    if (m.code === "raw") continue;
    if (!coefficients.some((c) => c.cookingMethodCode === m.code && c.foodCategory === "*")) {
      coefficients.push({
        cookingMethodCode: m.code,
        foodCategory: "*",
        weightChangeRate: 100,
        oilAbsorptionPct: m.usesOil ? 5 : 0,
        basis: "既定値(表12に該当例なし)",
        sampleSize: 0,
      });
    }
  }

  const foodsOut = foods.map((f) => ({
    foodNo: f.foodNo,
    indexNo: f.indexNo,
    groupCode: f.groupCode,
    nameRaw: f.nameRaw,
    refuse: f.refuse,
    note: f.note,
    density: densityFromNote(f.note),
    cookingMethod: detectCookingMethod(f.nameRaw),
    values: f.values,
  }));

  await mkdir(OUT, { recursive: true });
  const meta = {
    source: "日本食品標準成分表（八訂）増補2023年",
    publisher: "文部科学省",
    dataUpdated: updated,
    errataDate: "令和8年3月27日",
    files: manifest,
    builtAt: new Date().toISOString(),
    foods: foods.length,
    errata: {
      checked: errata.checked,
      matched: errata.matched,
      overwritten: errata.overwritten,
      skippedNonNumeric: errata.skipped,
    },
    cookedVariants: variants.length,
    unmatchedCookedFoods: unmatched,
  };
  await writeFile(path.join(OUT, "meta.json"), JSON.stringify(meta, null, 2));
  await writeFile(path.join(OUT, "foods.json"), JSON.stringify(foodsOut));
  await writeFile(path.join(OUT, "cooked-variants.json"), JSON.stringify(variants, null, 1));
  await writeFile(path.join(OUT, "cooking-coefficients.json"), JSON.stringify(coefficients, null, 1));

  console.log(`✓ foods: ${foods.length}(更新日: ${updated})`);
  console.log(
    `✓ 正誤照合: ${errata.checked} 項目中 ${errata.matched} 一致 / 上書き ${errata.overwritten.length} / 数値以外 ${errata.skipped}`,
  );
  for (const o of errata.overwritten) console.log(`  上書き ${o.foodNo} ${o.code}: ${o.excel} → ${o.correct}`);
  console.log(`✓ 調理後食品の対応: ${variants.length} 件(表12 にあるが生食品と対応できない: ${unmatched.length} 件)`);
  console.log(`✓ 後備係数: ${coefficients.length} 件`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

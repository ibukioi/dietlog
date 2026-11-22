/**
 * 成分の定義。キーは日本食品標準成分表(八訂)の成分識別子(INFOODS タグ)。
 * 単位は成分表の「可食部100 g当たり」の単位と同じ。
 */
export type NutrientCategory = "energy" | "macro" | "carb_detail" | "mineral" | "vitamin" | "other";

export interface NutrientDef {
  code: string;
  nameJa: string;
  shortJa?: string;
  unit: "kJ" | "kcal" | "g" | "mg" | "µg" | "%";
  category: NutrientCategory;
}

// 成分表 Excel の 12 行目(成分識別子)の並び順
export const NUTRIENTS: readonly NutrientDef[] = [
  { code: "ENERC", nameJa: "エネルギー(kJ)", unit: "kJ", category: "energy" },
  { code: "ENERC_KCAL", nameJa: "エネルギー", unit: "kcal", category: "energy" },
  { code: "WATER", nameJa: "水分", unit: "g", category: "other" },
  { code: "PROTCAA", nameJa: "アミノ酸組成によるたんぱく質", unit: "g", category: "macro" },
  { code: "PROT-", nameJa: "たんぱく質", unit: "g", category: "macro" },
  { code: "FATNLEA", nameJa: "脂肪酸のトリアシルグリセロール当量", unit: "g", category: "macro" },
  { code: "CHOLE", nameJa: "コレステロール", unit: "mg", category: "macro" },
  { code: "FAT-", nameJa: "脂質", unit: "g", category: "macro" },
  { code: "CHOAVLM", nameJa: "利用可能炭水化物(単糖当量)", unit: "g", category: "carb_detail" },
  { code: "CHOAVL", nameJa: "利用可能炭水化物(質量計)", unit: "g", category: "carb_detail" },
  { code: "CHOAVLDF-", nameJa: "差引き法による利用可能炭水化物", unit: "g", category: "carb_detail" },
  { code: "FIB-", nameJa: "食物繊維総量", shortJa: "食物繊維", unit: "g", category: "macro" },
  { code: "POLYL", nameJa: "糖アルコール", unit: "g", category: "carb_detail" },
  { code: "CHOCDF-", nameJa: "炭水化物", unit: "g", category: "macro" },
  { code: "OA", nameJa: "有機酸", unit: "g", category: "other" },
  { code: "ASH", nameJa: "灰分", unit: "g", category: "other" },
  { code: "NA", nameJa: "ナトリウム", unit: "mg", category: "mineral" },
  { code: "K", nameJa: "カリウム", unit: "mg", category: "mineral" },
  { code: "CA", nameJa: "カルシウム", unit: "mg", category: "mineral" },
  { code: "MG", nameJa: "マグネシウム", unit: "mg", category: "mineral" },
  { code: "P", nameJa: "リン", unit: "mg", category: "mineral" },
  { code: "FE", nameJa: "鉄", unit: "mg", category: "mineral" },
  { code: "ZN", nameJa: "亜鉛", unit: "mg", category: "mineral" },
  { code: "CU", nameJa: "銅", unit: "mg", category: "mineral" },
  { code: "MN", nameJa: "マンガン", unit: "mg", category: "mineral" },
  { code: "ID", nameJa: "ヨウ素", unit: "µg", category: "mineral" },
  { code: "SE", nameJa: "セレン", unit: "µg", category: "mineral" },
  { code: "CR", nameJa: "クロム", unit: "µg", category: "mineral" },
  { code: "MO", nameJa: "モリブデン", unit: "µg", category: "mineral" },
  { code: "RETOL", nameJa: "レチノール", unit: "µg", category: "vitamin" },
  { code: "CARTA", nameJa: "α-カロテン", unit: "µg", category: "vitamin" },
  { code: "CARTB", nameJa: "β-カロテン", unit: "µg", category: "vitamin" },
  { code: "CRYPXB", nameJa: "β-クリプトキサンチン", unit: "µg", category: "vitamin" },
  { code: "CARTBEQ", nameJa: "β-カロテン当量", unit: "µg", category: "vitamin" },
  { code: "VITA_RAE", nameJa: "ビタミンA(レチノール活性当量)", shortJa: "ビタミンA", unit: "µg", category: "vitamin" },
  { code: "VITD", nameJa: "ビタミンD", unit: "µg", category: "vitamin" },
  { code: "TOCPHA", nameJa: "ビタミンE(α-トコフェロール)", shortJa: "ビタミンE", unit: "mg", category: "vitamin" },
  { code: "TOCPHB", nameJa: "β-トコフェロール", unit: "mg", category: "vitamin" },
  { code: "TOCPHG", nameJa: "γ-トコフェロール", unit: "mg", category: "vitamin" },
  { code: "TOCPHD", nameJa: "δ-トコフェロール", unit: "mg", category: "vitamin" },
  { code: "VITK", nameJa: "ビタミンK", unit: "µg", category: "vitamin" },
  { code: "THIA", nameJa: "ビタミンB1", unit: "mg", category: "vitamin" },
  { code: "RIBF", nameJa: "ビタミンB2", unit: "mg", category: "vitamin" },
  { code: "NIA", nameJa: "ナイアシン", unit: "mg", category: "vitamin" },
  { code: "NE", nameJa: "ナイアシン当量", shortJa: "ナイアシン", unit: "mg", category: "vitamin" },
  { code: "VITB6A", nameJa: "ビタミンB6", unit: "mg", category: "vitamin" },
  { code: "VITB12", nameJa: "ビタミンB12", unit: "µg", category: "vitamin" },
  { code: "FOL", nameJa: "葉酸", unit: "µg", category: "vitamin" },
  { code: "PANTAC", nameJa: "パントテン酸", unit: "mg", category: "vitamin" },
  { code: "BIOT", nameJa: "ビオチン", unit: "µg", category: "vitamin" },
  { code: "VITC", nameJa: "ビタミンC", unit: "mg", category: "vitamin" },
  { code: "ALC", nameJa: "アルコール", unit: "g", category: "other" },
  { code: "NACL_EQ", nameJa: "食塩相当量", shortJa: "食塩", unit: "g", category: "macro" },
] as const;

export const NUTRIENT_CODES = NUTRIENTS.map((n) => n.code);

const byCode = new Map(NUTRIENTS.map((n) => [n.code, n]));

export function nutrientDef(code: string): NutrientDef {
  const def = byCode.get(code);
  if (!def) throw new Error(`unknown nutrient code: ${code}`);
  return def;
}

export function nutrientLabel(code: string): string {
  const def = nutrientDef(code);
  return def.shortJa ?? def.nameJa;
}

/** 集計の高速化用に meal_item に非正規化して持つ 5 成分 */
export const CORE = {
  energy: "ENERC_KCAL",
  protein: "PROT-",
  fat: "FAT-",
  carb: "CHOCDF-",
  salt: "NACL_EQ",
} as const;

/** 入力・表示で扱う主要成分(手入力フォームなど) */
export const PRIMARY_CODES = ["ENERC_KCAL", "PROT-", "FAT-", "CHOCDF-", "NACL_EQ", "FIB-"] as const;

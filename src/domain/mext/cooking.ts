/**
 * 調理法の定義と、成分表の食品名からの調理法判定・生食品との対応づけ(§2.3・§4.4)
 */

export const COOKING_METHODS = [
  { code: "raw", nameJa: "生(そのまま)", keywords: ["生"], usesOil: false },
  { code: "boil", nameJa: "ゆでる", keywords: ["ゆで"], usesOil: false },
  { code: "steam", nameJa: "蒸す", keywords: ["蒸し"], usesOil: false },
  { code: "grill", nameJa: "焼く", keywords: ["焼き"], usesOil: false },
  { code: "saute", nameJa: "炒める", keywords: ["油いため", "ソテー"], usesOil: true },
  { code: "deep_fry", nameJa: "揚げる(素揚げ・から揚げ)", keywords: ["素揚げ", "から揚げ", "揚げ"], usesOil: true },
  { code: "tempura", nameJa: "天ぷら", keywords: ["天ぷら"], usesOil: true },
  { code: "fry", nameJa: "フライ", keywords: ["フライ"], usesOil: true },
  { code: "simmer", nameJa: "煮る(煮汁は残す)", keywords: ["水煮", "煮"], usesOil: false },
  // 成分表の「ゆで」「水煮」はゆで汁・煮汁を捨てて測った値。汁ごと食べる料理では、溶け出た成分も摂るので
  // 調理前の成分値で計算する(成分表の食品名には現れないので keywords は空)
  { code: "soup", nameJa: "汁ごと食べる(味噌汁・スープ・鍋)", keywords: [], usesOil: false },
  { code: "microwave", nameJa: "電子レンジ", keywords: ["電子レンジ調理"], usesOil: false },
] as const;

export type CookingMethodCode = (typeof COOKING_METHODS)[number]["code"];

export const OIL_METHODS: ReadonlySet<string> = new Set(COOKING_METHODS.filter((m) => m.usesOil).map((m) => m.code));

export function cookingMethodName(code: string): string {
  return COOKING_METHODS.find((m) => m.code === code)?.nameJa ?? code;
}

/** 食品名を全角空白で区切ったトークン列 */
export function nameTokens(nameRaw: string): string[] {
  return nameRaw
    .split(/[　 ]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

// 食品名の末尾トークンと調理法の対応(完全一致を優先)
const TOKEN_TO_METHOD: Array<[RegExp, CookingMethodCode]> = [
  [/^(.*、)?ゆで$/, "boil"],
  [/^(.*、)?蒸し$/, "steam"],
  [/^(.*、)?(焼き|焼)$/, "grill"],
  [/^(.*、)?(油いため|ソテー)/, "saute"],
  [/^(.*、)?天ぷら$/, "tempura"],
  [/^(.*、)?フライ$/, "fry"],
  [/^(.*、)?(素揚げ|から揚げ|揚げ)$/, "deep_fry"],
  [/^(.*、)?電子レンジ調理$/, "microwave"],
  [/^(.*、)?(水煮|煮)$/, "simmer"],
];

/**
 * 成分表の食品名(最後のトークン)から調理法を判定する。
 * 例: "ほうれんそう　葉　通年平均　ゆで" → "boil"
 * 缶詰の「水煮」など加工品の一部は誤判定し得るが、生食品と対応づけられない限り使われない。
 */
export function detectCookingMethod(nameRaw: string): CookingMethodCode | null {
  const tokens = nameTokens(nameRaw);
  const last = tokens.at(-1);
  if (!last) return null;
  for (const [re, code] of TOKEN_TO_METHOD) {
    if (re.test(last)) return code;
  }
  return null;
}

/**
 * 調理後食品に対応する生食品の候補名を作る。
 *   "なす　果実　ゆで"            → ["なす　果実　生", "なす　果実"]
 *   "うし　［乳用肥育牛肉］　かた　脂身つき　焼き" → [... "生", ...]
 */
export function rawNameCandidates(cookedNameRaw: string): string[] {
  const tokens = nameTokens(cookedNameRaw);
  if (tokens.length < 2) return [];
  const base = tokens.slice(0, -1);
  return [[...base, "生"].join("　"), [...base, "乾"].join("　"), base.join("　")];
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * 栄養値の型と演算(§2.1・§4.3)
 *
 * - 値は number(既知)か null(不明)。不明を 0 として黙って足さない
 * - 合計は「既知値の合計」と「不明を含む項目数」を両方持つ
 */

/** 成分コード → 値。null = 不明(未測定・未記載)。キーが無い場合も不明扱い */
export type NutrientMap = Record<string, number | null>;

export interface NutrientTotal {
  /** 既知値の合計 */
  sum: number;
  /** その成分が不明だった項目数 */
  unknownItems: number;
  /** 項目数 */
  items: number;
}

export type NutrientTotals = Record<string, NutrientTotal>;

export function valueOf(map: NutrientMap, code: string): number | null {
  const v = map[code];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** 成分ベクトルを倍率でスケール(不明は不明のまま) */
export function scale(map: NutrientMap, factor: number): NutrientMap {
  const out: NutrientMap = {};
  for (const [code, v] of Object.entries(map)) {
    out[code] = typeof v === "number" ? v * factor : null;
  }
  return out;
}

/**
 * 成分ベクトルの加算。どちらかが不明なら結果も不明(1 品の内訳として使う)。
 * キーの和集合を取り、片方にしかないキーは不明扱い。
 */
export function addStrict(a: NutrientMap, b: NutrientMap): NutrientMap {
  const out: NutrientMap = {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const x = valueOf(a, k);
    const y = valueOf(b, k);
    out[k] = x === null || y === null ? null : x + y;
  }
  return out;
}

export function sumStrict(maps: NutrientMap[], codes: readonly string[]): NutrientMap {
  const out: NutrientMap = {};
  for (const code of codes) {
    let total = 0;
    let unknown = false;
    for (const m of maps) {
      const v = valueOf(m, code);
      if (v === null) {
        unknown = true;
        break;
      }
      total += v;
    }
    out[code] = unknown ? null : total;
  }
  return out;
}

/** 複数項目(食事記録)の集計。不明は件数として残す */
export function totals(maps: NutrientMap[], codes: readonly string[]): NutrientTotals {
  const out: NutrientTotals = {};
  for (const code of codes) {
    let sum = 0;
    let unknownItems = 0;
    for (const m of maps) {
      const v = valueOf(m, code);
      if (v === null) unknownItems += 1;
      else sum += v;
    }
    out[code] = { sum, unknownItems, items: maps.length };
  }
  return out;
}

export function round(value: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export function roundMap(map: NutrientMap, digits = 3): NutrientMap {
  const out: NutrientMap = {};
  for (const [k, v] of Object.entries(map)) out[k] = v === null ? null : round(v, digits);
  return out;
}

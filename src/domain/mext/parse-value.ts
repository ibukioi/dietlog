/**
 * 日本食品標準成分表(八訂)の収載値の表記を解釈する(§0.1・§2.3)
 *
 *   -      未測定            → null / missing
 *   Tr     微量              → 0    / trace
 *   (Tr)   推定値で微量       → 0    / trace
 *   (0)    推定値でゼロ       → 0    / est_zero
 *   (1.2)  推計値            → 1.2  / estimated
 *   1.2    分析値など        → 1.2  / measured
 *   1.2†   注記付きの数値     → 1.2  / measured
 */
export type ValueFlag = "measured" | "estimated" | "trace" | "est_zero" | "missing";

export interface ParsedValue {
  value: number | null;
  flag: ValueFlag;
  raw: string;
}

export function parseMextValue(input: unknown): ParsedValue {
  if (input === null || input === undefined) {
    return { value: null, flag: "missing", raw: "" };
  }
  if (typeof input === "number") {
    return { value: input, flag: "measured", raw: String(input) };
  }
  const raw = String(input).trim();
  const s = raw
    .replace(/[†‡*＊\s]/g, "")
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")");

  if (s === "" || s === "-" || s === "－" || s === "−" || s === "ー") {
    return { value: null, flag: "missing", raw };
  }
  if (s === "Tr" || s === "(Tr)") {
    return { value: 0, flag: "trace", raw };
  }
  if (s === "(0)") {
    return { value: 0, flag: "est_zero", raw };
  }
  const est = /^\((-?\d+(?:\.\d+)?)\)$/.exec(s);
  if (est) {
    return { value: Number(est[1]), flag: "estimated", raw };
  }
  if (/^-?\d+(?:\.\d+)?$/.test(s)) {
    return { value: Number(s), flag: "measured", raw };
  }
  throw new Error(`unrecognized MEXT value: "${raw}"`);
}

/** 正誤表の比較用: 表記の揺れ(全角括弧・空白)を無視して同じ値か */
export function sameMextValue(a: unknown, b: unknown): boolean {
  try {
    const x = parseMextValue(a);
    const y = parseMextValue(b);
    return x.flag === y.flag && x.value === y.value;
  } catch {
    return String(a ?? "").trim() === String(b ?? "").trim();
  }
}

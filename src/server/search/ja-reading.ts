/**
 * 漢字・ひらがな・カタカナの表記ゆれを吸収するための「読み」(すべてひらがな)を作る。
 * 形態素解析の辞書は大きいので、漢字を含む文字列を処理するときに初めて読み込む。
 */
import path from "node:path";

import type { IpadicFeatures, Tokenizer } from "kuromoji";

import { hasKanji, normalizeJa } from "@/lib/ja-normalize";

/** 形態素解析が食品名として誤読する語 */
const READING_FIXES: ReadonlyArray<readonly [string, string]> = [
  ["木綿", "もめん"],
  ["茄子", "なす"],
  ["長葱", "ながねぎ"],
  ["長ねぎ", "ながねぎ"],
];

let tokenizer: Promise<Tokenizer<IpadicFeatures>> | null = null;

function getTokenizer() {
  tokenizer ??= import("kuromoji").then(
    ({ default: kuromoji }) =>
      new Promise<Tokenizer<IpadicFeatures>>((resolve, reject) => {
        kuromoji
          .builder({ dicPath: path.join(process.cwd(), "node_modules/kuromoji/dict") })
          .build((err, t) => (err ? reject(err) : resolve(t)));
      }),
  );
  // 読み込みに失敗したら次の検索でやり直す
  tokenizer.catch(() => {
    tokenizer = null;
  });
  return tokenizer;
}

/** 語ごとの読み(ひらがな) */
async function tokenReadings(text: string): Promise<string[]> {
  let src = text.normalize("NFKC");
  for (const [from, to] of READING_FIXES) src = src.replaceAll(from, to);
  if (!hasKanji(src)) return [normalizeJa(src)].filter(Boolean);
  const t = await getTokenizer();
  return t
    .tokenize(src)
    .map((x) => {
      // 食品名の「生」は「なま」
      if (x.surface_form === "生") return "なま";
      return normalizeJa(x.reading && x.reading !== "*" ? x.reading : x.surface_form);
    })
    .filter(Boolean);
}

export async function toReading(text: string): Promise<string> {
  return (await tokenReadings(text)).join("");
}

/** 名前を区切りごとに読みにする。区切りをまたいだ誤一致を防ぐため空白でつなぐ */
export async function searchReadingOf(parts: Array<string | null | undefined>): Promise<string> {
  const pieces = parts
    .filter((p): p is string => Boolean(p))
    .flatMap((p) => p.split(/[\s　＜＞<>［］\[\]（）()、,・]+/))
    .filter(Boolean);
  const readings = await Promise.all(pieces.map(toReading));
  return [...new Set(readings.filter(Boolean))].join(" ");
}

/** 検索語を、読みの列に AND で当てる語の配列にする。例: 「鶏胸肉」→ ["にわとり", "むね"] */
export async function readingTerms(query: string): Promise<string[]> {
  const out: string[] = [];
  for (const raw of query.split(/[\s　]+/)) {
    const word = normalizeJa(raw);
    if (!word) continue;
    if (!hasKanji(word)) {
      out.push(word);
      continue;
    }
    const tokens = await tokenReadings(raw);
    const useful = tokens.filter((t) => t !== "にく");
    const kept = useful.length > 1 ? useful.filter((t) => t.length >= 2) : useful;
    out.push(...(kept.length ? kept : [tokens.join("")]));
  }
  return [...new Set(out.filter(Boolean))];
}

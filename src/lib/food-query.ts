import aliasesJson from "../../data/manual/aliases.json";

import { normalizeJa } from "./ja-normalize";

/** [別名, 成分表の名前に含まれる語]。長い別名から先に置き換える */
const ALIASES = (aliasesJson.aliases as [string, string][])
  .map(([a, t]) => [normalizeJa(a), normalizeJa(t)] as const)
  .filter(([a, t]) => a && t && a !== t)
  .sort((x, y) => y[0].length - x[0].length);

/**
 * 検索語を成分表の語彙に寄せて、AND 検索する語の配列にする。
 *   "鶏むね"     → ["にわとり", "むね"]
 *   "ほうれん草" → ["ほうれんそう"]
 *   "玉ねぎ 炒め" → ["たまねぎ", "炒め"]
 */
export function expandFoodQuery(query: string): string[] {
  const out: string[] = [];
  for (const raw of query.split(/[\s　]+/)) {
    let t = normalizeJa(raw);
    // かなで続けて書いた鶏の部位(「とりむね」「トリモモ」)は「にわとり」と部位に分ける
    const chicken = /^とり(むね|もも|ささみ|てば|ひき)/.exec(t);
    if (chicken) {
      out.push("にわとり");
      t = t.slice(2);
    }
    // 左から最長一致で別名を置き換える(置き換えた語は再度置き換えない)
    let rest = "";
    let i = 0;
    while (i < t.length) {
      const hit = ALIASES.find(([alias]) => t.startsWith(alias, i));
      if (hit) {
        if (rest) out.push(rest);
        rest = "";
        out.push(hit[1]);
        i += hit[0].length;
      } else {
        rest += t[i];
        i += 1;
      }
    }
    if (rest) out.push(rest);
  }
  return [...new Set(out.filter((x) => x !== "肉"))];
}

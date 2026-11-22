import { describe, expect, it } from "vitest";

import * as copy from "./analysis-copy";

function allText(): string[] {
  const out: string[] = [];
  for (const [key, v] of Object.entries(copy)) {
    if (key === "BANNED_WORDS") continue;
    if (typeof v === "string") out.push(v);
    else if (typeof v === "function") out.push(String((v as (n: number) => string)(3)));
    else if (v && typeof v === "object") out.push(...Object.values(v).map(String));
  }
  return out;
}

describe("分析画面の文言(§9 法令・表示上のリスク)", () => {
  it.each(copy.BANNED_WORDS)("「%s」を使っていない", (word) => {
    for (const text of allText()) expect(text).not.toContain(word);
  });

  it("医療に代わるものではない旨を含む", () => {
    expect(copy.DISCLAIMER).toContain("医療に代わるものではありません");
  });
});

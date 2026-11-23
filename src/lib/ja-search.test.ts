import { describe, expect, it } from "vitest";

import { searchReadingOf, readingTerms, toReading } from "@/server/search/ja-reading";

import { hasKanji, matchesSearch } from "./ja-normalize";

describe("漢字・ひらがな・カタカナの読み", () => {
  it.each([
    ["手羽先", "てばさき"],
    ["手羽さき", "てばさき"],
    ["テバサキ", "てばさき"],
    ["人参", "にんじん"],
    ["玉葱", "たまねぎ"],
    ["生姜", "しょうが"],
    ["木綿豆腐", "もめんとうふ"],
    ["茄子", "なす"],
    ["長葱", "ながねぎ"],
  ])("%s → %s", async (q, reading) => {
    expect(await toReading(q)).toBe(reading);
  });

  it("「肉」だけの語は検索条件から除く", async () => {
    expect(await readingTerms("鶏胸肉")).toEqual(["にわとり", "むね"]);
  });

  it("食品名の区切りをまたいで一致しない", async () => {
    expect(await searchReadingOf(["にわとり　［若どり］　手羽さき　生"])).toBe("にわとり わかどり てばさき なま");
  });

  it("絞り込みは表記によらず一致する", async () => {
    const reading = await searchReadingOf(["鶏の手羽先"]);
    expect(matchesSearch("手羽先", "鶏の手羽先", reading, [])).toBe(true);
    expect(matchesSearch("テバサキ", "鶏の手羽先", reading, await readingTerms("テバサキ"))).toBe(true);
    expect(matchesSearch("さば", "鶏の手羽先", reading, await readingTerms("さば"))).toBe(false);
    expect(hasKanji("てばさき")).toBe(false);
  });
});

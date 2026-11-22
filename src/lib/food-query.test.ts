import { describe, expect, it } from "vitest";

import { expandFoodQuery } from "./food-query";
import { displayNameFromMext, normalizeJa } from "./ja-normalize";

describe("検索語の正規化と同義語展開", () => {
  it.each([
    ["鶏むね", ["にわとり", "むね"]],
    ["ほうれん草", ["ほうれんそう"]],
    ["玉ねぎ", ["たまねぎ"]],
    ["卵", ["鶏卵"]],
    ["鶏もも肉", ["にわとり", "もも"]],
    ["ゴハン", ["めし"]],
    ["にんじん", ["にんじん"]],
  ])("%s → %o", (q, terms) => {
    expect(expandFoodQuery(q)).toEqual(terms.map(normalizeJa));
  });

  it("カタカナはひらがなに、記号・空白は除いて比べる", () => {
    expect(normalizeJa("＜調味料類＞　（しょうゆ類）　コイクチ")).toBe("調味料類しょうゆ類こいくち");
  });

  it("表示名から分類の括弧を除く", () => {
    expect(displayNameFromMext("＜調味料類＞　（しょうゆ類）　こいくちしょうゆ")).toBe("こいくちしょうゆ");
    expect(displayNameFromMext("（たまねぎ類）　たまねぎ　りん茎　生")).toBe("たまねぎ りん茎 生");
    expect(displayNameFromMext("こむぎ　［パン類］　角形食パン　食パン")).toBe("こむぎ パン類 角形食パン 食パン");
  });
});

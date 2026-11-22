import { describe, expect, it } from "vitest";

import { parseMextValue, sameMextValue } from "./parse-value";

describe("parseMextValue: 成分表の収載値の表記", () => {
  it.each([
    ["-", null, "missing"],
    ["Tr", 0, "trace"],
    ["(Tr)", 0, "trace"],
    ["(0)", 0, "est_zero"],
    ["(1.2)", 1.2, "estimated"],
    ["（3.6）", 3.6, "estimated"],
    ["12.5", 12.5, "measured"],
    ["0", 0, "measured"],
    ["5†", 5, "measured"],
    [116, 116, "measured"],
    ["", null, "missing"],
    [null, null, "missing"],
  ])("%s → %s (%s)", (raw, value, flag) => {
    const p = parseMextValue(raw);
    expect(p.value).toBe(value);
    expect(p.flag).toBe(flag);
  });

  it("解釈できない表記はエラーにする(黙って 0 にしない)", () => {
    expect(() => parseMextValue("abc")).toThrow();
  });

  it("正誤表の照合では表記揺れを無視する", () => {
    expect(sameMextValue("(3.6)", "（3.6）")).toBe(true);
    expect(sameMextValue("3.6", "(3.6)")).toBe(false); // 推計値かどうかは区別する
    expect(sameMextValue(116, "116")).toBe(true);
  });
});

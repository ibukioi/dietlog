import { describe, expect, it } from "vitest";

import { ageFromBirthYearMonth, driFor, estimatedEnergyRequirement } from "@/domain/dri/dri";

import { type Goal, defaultGoals, gaugeState } from "./goals";

const total = (sum: number, unknownItems = 0) => ({ sum, unknownItems, items: 1 });

describe("食事摂取基準(2025年版)の参照", () => {
  it("年齢は生年月から計算する", () => {
    expect(ageFromBirthYearMonth("1995-04", new Date("2026-11-22"))).toBe(31);
    expect(ageFromBirthYearMonth("1995-12", new Date("2026-11-22"))).toBe(30);
  });

  it("推定エネルギー必要量 = 体重1kg当たり × 体重(参考表1)", () => {
    // 女性 30〜49 歳 ふつう 38.3 kcal/kg × 52 kg = 1991.6 → 10 kcal 単位で丸め
    expect(estimatedEnergyRequirement({ age: 32, sex: "female", weightKg: 52, activityLevel: "II" })).toBe(1990);
    // 75 歳以上の「高い」は設定がないので「ふつう」を使う
    expect(estimatedEnergyRequirement({ age: 80, sex: "male", weightKg: 60, activityLevel: "III" })).toBe(
      estimatedEnergyRequirement({ age: 80, sex: "male", weightKg: 60, activityLevel: "II" }),
    );
  });

  it("鉄は女性の月経の有無で基準値を切り替える", () => {
    expect(driFor("FE", { age: 30, sex: "female", menstruation: true })?.rda).toBe(10.5);
    expect(driFor("FE", { age: 30, sex: "female", menstruation: false })?.rda).toBe(6.0);
    expect(driFor("FE", { age: 30, sex: "male" })?.rda).toBe(7.5);
  });

  it("ビタミンB12 は 2025 年版では目安量(AI)", () => {
    const b12 = driFor("VITB12", { age: 40, sex: "male" });
    expect(b12?.ai).toBe(4.0);
    expect(b12?.rda).toBeNull();
  });
});

describe("目標の初期値", () => {
  const goals = defaultGoals({ age: 32, sex: "female", weightKg: 52, activityLevel: "II", menstruation: true });
  const g = (code: string) => goals.find((x) => x.nutrientCode === code)!;

  it("カロリーは推定エネルギー必要量を上限とする", () => {
    expect(g("ENERC_KCAL")).toMatchObject({ target: 1990, direction: "at_most" });
  });
  it("脂質・炭水化物はエネルギー比の目標量から範囲で決める", () => {
    // 脂質 20〜30 %E: 1990 × 0.2 / 9 ≒ 44, × 0.3 / 9 ≒ 66
    expect(g("FAT-")).toMatchObject({ target: 44, upper: 66, direction: "range" });
    // 炭水化物 50〜65 %E: 1990 × 0.5 / 4 ≒ 249, × 0.65 / 4 ≒ 323
    expect(g("CHOCDF-")).toMatchObject({ target: 249, upper: 323, direction: "range" });
  });
  it("たんぱく質は推奨量と %E 下限の大きい方", () => {
    // 推奨量 50 g、13 %E = 1990 × 0.13 / 4 ≒ 64.7 g
    expect(g("PROT-").target).toBe(65);
  });
  it("食塩は目標量(女性 6.5 g 未満)", () => {
    expect(g("NACL_EQ")).toMatchObject({ target: 6.5, direction: "at_most" });
  });
});

describe("HP ゲージの状態", () => {
  const atMost: Goal = {
    nutrientCode: "ENERC_KCAL",
    target: 2000,
    direction: "at_most",
    upper: null,
    showOnHome: true,
    displayOrder: 0,
  };
  const atLeast: Goal = {
    nutrientCode: "PROT-",
    target: 60,
    direction: "at_least",
    upper: null,
    showOnHome: true,
    displayOrder: 1,
  };
  const range: Goal = {
    nutrientCode: "FAT-",
    target: 44,
    direction: "range",
    upper: 66,
    showOnHome: true,
    displayOrder: 2,
  };

  it.each([
    [atMost, 0, "empty"],
    [atMost, 1000, "ok"],
    [atMost, 1600, "warn"], // 80% で黄色
    [atMost, 2000, "warn"],
    [atMost, 2230, "over"],
    [atLeast, 30, "low"],
    [atLeast, 60, "full"], // 100% で満タン
    [atLeast, 90, "full"],
    [range, 30, "low"],
    [range, 50, "ok"],
    [range, 70, "over"],
  ] as const)("%o: %d → %s", (goal, intake, status) => {
    expect(gaugeState(goal, total(intake)).status).toBe(status);
  });

  it("超過量を返す(例: +230 kcal オーバー)", () => {
    expect(gaugeState(atMost, total(2230)).overBy).toBe(230);
    expect(gaugeState(range, total(70)).overBy).toBe(4);
  });

  it("不明データを含むことを伝える", () => {
    expect(gaugeState(atLeast, total(30, 2)).hasUnknown).toBe(true);
  });
});

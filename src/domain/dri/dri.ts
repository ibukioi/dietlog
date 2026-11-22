/**
 * 日本人の食事摂取基準(2025年版)の参照(§5.1)
 * データは data/dri/dri-2025.json(報告書の表から転記。成人のみ)
 */
import driJson from "../../../data/dri/dri-2025.json";

export type Sex = "male" | "female";
export type ActivityLevel = "I" | "II" | "III";

export interface DriRow {
  nutrientCode: string;
  sex: Sex;
  ageMin: number;
  ageMax: number;
  variant: string | null;
  ear: number | null;
  rda: number | null;
  ai: number | null;
  dgLower: number | null;
  dgUpper: number | null;
  ul: number | null;
  sourceRef: string;
}

export interface PersonForDri {
  age: number;
  sex: Sex;
  /** 女性 18〜64 歳の鉄の基準値の選択に使う */
  menstruation?: boolean;
}

export const DRI_TITLE: string = driJson.title;
export const DRI_ROWS = driJson.values as DriRow[];
export const DRI_UNITS = driJson.units as Record<string, string>;
export const DRI_NUTRIENTS = [...new Set(DRI_ROWS.map((r) => r.nutrientCode))];

export function ageFromBirthYearMonth(birthYearMonth: string, today: Date): number {
  const [y, m] = birthYearMonth.split("-").map(Number);
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m) age -= 1;
  return age;
}

export function driFor(code: string, p: PersonForDri, rows: DriRow[] = DRI_ROWS): DriRow | null {
  const candidates = rows.filter(
    (r) => r.nutrientCode === code && r.sex === p.sex && p.age >= r.ageMin && p.age <= r.ageMax,
  );
  if (candidates.length === 0) return null;
  if (code === "FE" && p.sex === "female") {
    const want = p.menstruation ? "menstruation" : "no_menstruation";
    return (
      candidates.find((r) => r.variant === want) ?? candidates.find((r) => r.variant === "no_menstruation") ?? null
    );
  }
  return candidates[0];
}

const BRACKET_INDEX = (age: number) => driJson.energy.brackets.findIndex(([min, max]) => age >= min && age <= max);

/**
 * 推定エネルギー必要量(kcal/日) = 体重 1 kg 当たりの推定エネルギー必要量 × 体重(参考表1)
 * 75 歳以上の「高い」は設定がないため「ふつう」を使う
 */
export function estimatedEnergyRequirement(p: {
  age: number;
  sex: Sex;
  weightKg: number;
  activityLevel: ActivityLevel;
}): number | null {
  const i = BRACKET_INDEX(p.age);
  if (i < 0) return null;
  const table = driJson.energy[p.sex] as Record<ActivityLevel, Array<number | null>>;
  const perKg = table[p.activityLevel][i] ?? table.II[i];
  if (perKg === null || perKg === undefined) return null;
  return Math.round((perKg * p.weightKg) / 10) * 10;
}

/** エネルギー産生栄養素バランス(%エネルギー、目標量) */
export function pfcTargets(age: number) {
  const i = Math.max(0, BRACKET_INDEX(age));
  const [pLow, pHigh] = driJson.pfc.protein[i];
  return {
    proteinPct: [pLow, pHigh] as [number, number],
    fatPct: driJson.pfc.fat as [number, number],
    carbPct: driJson.pfc.carb as [number, number],
  };
}

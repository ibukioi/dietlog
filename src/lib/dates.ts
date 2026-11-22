import { TZDate } from "@date-fns/tz";
import { addDays, format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";

export const APP_TZ = "Asia/Tokyo";

/** ユーザー TZ(MVP は Asia/Tokyo 固定)での今日 "YYYY-MM-DD" */
export function todayIso(now: Date = new Date()): string {
  return format(new TZDate(now, APP_TZ), "yyyy-MM-dd");
}

export function shiftIso(iso: string, days: number): string {
  return format(addDays(parseISO(iso), days), "yyyy-MM-dd");
}

export function isIsoDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseISO(s).getTime());
}

/** "11月22日(土)" */
export function formatJaDate(iso: string): string {
  return format(parseISO(iso), "M月d日(E)", { locale: ja });
}

export function rangeIso(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = shiftIso(d, 1)) out.push(d);
  return out;
}

export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealType = (typeof MEAL_TYPES)[number];
export const MEAL_TYPE_LABEL: Record<MealType, string> = {
  breakfast: "朝食",
  lunch: "昼食",
  dinner: "夕食",
  snack: "間食",
};

/** 時刻から食事区分の初期値を推定 */
export function guessMealType(now: Date = new Date()): MealType {
  const h = new TZDate(now, APP_TZ).getHours();
  if (h < 10) return "breakfast";
  if (h < 15) return "lunch";
  if (h < 21) return "dinner";
  return "snack";
}

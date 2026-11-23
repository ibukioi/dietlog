"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { CORE } from "@/domain/nutrients/catalog";
import { type NutrientMap, roundMap, scale } from "@/domain/nutrients/types";
import { MEAL_TYPES, isIsoDate } from "@/lib/dates";
import { requireUser } from "@/server/auth/session";
import { deleteMealItem, getMealItem, setDayComplete, updateMealItem } from "@/server/repositories/meals";

export async function deleteMealItemAction(id: string) {
  const user = await requireUser();
  const ok = await deleteMealItem(user.id, z.string().uuid().parse(id));
  revalidatePath("/home");
  revalidatePath("/history");
  return { ok };
}

export async function setDayCompleteAction(date: string, complete: boolean) {
  const user = await requireUser();
  if (!isIsoDate(date)) throw new Error("invalid date");
  await setDayComplete(user.id, date, complete);
  revalidatePath("/home");
  revalidatePath("/analysis");
}

const editSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mealType: z.enum(MEAL_TYPES),
  quantity: z.number().positive().max(10000),
  /** 手入力の記録だけ: 主要成分を直接書き換える(null = 記載なし) */
  core: z.record(z.string(), z.number().min(0).max(100000).nullable()).optional(),
});

/**
 * 記録の簡易編集: 名前・日付・食事区分・量。
 * 量を変えたら栄養値を同じ比率で増減する(1 人前 → 1.5 人前なら 1.5 倍)。
 */
export async function updateMealItemAction(input: z.infer<typeof editSchema>) {
  const user = await requireUser();
  const v = editSchema.parse(input);
  const current = await getMealItem(user.id, v.id);
  if (!current) throw new Error("記録が見つかりません");

  const factor = current.quantity > 0 ? v.quantity / current.quantity : 1;
  let nutrients: NutrientMap = roundMap(scale(current.nutrientsJson, factor));
  if (v.core && current.kind === "manual") {
    nutrients = { ...nutrients };
    for (const code of Object.values(CORE)) if (code in v.core) nutrients[code] = v.core[code];
  }
  await updateMealItem(user.id, v.id, {
    name: v.name,
    date: v.date,
    mealType: v.mealType,
    quantity: v.quantity,
    grams: current.grams === null ? null : Math.round(current.grams * factor * 10) / 10,
    nutrients,
  });
  revalidatePath("/home");
  revalidatePath("/history");
  revalidatePath("/analysis");
  return { ok: true };
}

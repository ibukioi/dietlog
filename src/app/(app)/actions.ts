"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isIsoDate } from "@/lib/dates";
import { requireUser } from "@/server/auth/session";
import { deleteMealItem, setDayComplete } from "@/server/repositories/meals";

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

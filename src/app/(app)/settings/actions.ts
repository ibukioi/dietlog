"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/server/auth/auth";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { getProfile, resetGoalsFromProfile, saveGoals, upsertProfile } from "@/server/repositories/profile";

const thisYear = new Date().getFullYear();

const profileSchema = z.object({
  birthYearMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "生年月を選んでください")
    .refine((v) => {
      const y = Number(v.slice(0, 4));
      return y >= thisYear - 110 && y <= thisYear - 1;
    }, "生年月を確認してください"),
  sex: z.enum(["male", "female"], "性別を選んでください"),
  heightCm: z.coerce
    .number("身長を入力してください")
    .min(100, "身長は 100〜230 cm で入力してください")
    .max(230, "身長は 100〜230 cm で入力してください"),
  weightKg: z.coerce
    .number("体重を入力してください")
    .min(25, "体重は 25〜250 kg で入力してください")
    .max(250, "体重は 25〜250 kg で入力してください"),
  activityLevel: z.enum(["I", "II", "III"], "身体活動レベルを選んでください"),
  lifeStage: z.enum(["none", "pregnant", "lactating"]).default("none"),
  menstruation: z.coerce.boolean().default(false),
  recalcGoals: z.coerce.boolean().default(false),
});

export type ProfileFormState = { error?: string; ok?: boolean };

export async function saveProfileAction(_prev: ProfileFormState, form: FormData): Promise<ProfileFormState> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse({
    birthYearMonth: form.get("birthYearMonth"),
    sex: form.get("sex"),
    heightCm: form.get("heightCm"),
    weightKg: form.get("weightKg"),
    activityLevel: form.get("activityLevel"),
    lifeStage: form.get("lifeStage") ?? "none",
    menstruation: form.get("menstruation") === "on",
    recalcGoals: form.get("recalcGoals") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "入力を確認してください" };
  const { recalcGoals, ...p } = parsed.data;
  const hadProfile = Boolean(await getProfile(user.id));
  await upsertProfile(user.id, {
    ...p,
    menstruation: p.sex === "female" ? p.menstruation : false,
    timezone: "Asia/Tokyo",
  });
  if (recalcGoals || !hadProfile) {
    const saved = await getProfile(user.id);
    await resetGoalsFromProfile(user.id, saved!);
  }
  revalidatePath("/", "layout");
  if (form.get("from") === "onboarding") redirect("/home");
  return { ok: true };
}

const goalSchema = z.array(
  z.object({
    nutrientCode: z.string(),
    target: z.number().positive().max(100000),
    direction: z.enum(["at_least", "at_most", "range"]),
    upper: z.number().positive().max(100000).nullable(),
    showOnHome: z.boolean(),
    displayOrder: z.number().int(),
  }),
);

export async function saveGoalsAction(goals: z.infer<typeof goalSchema>) {
  const user = await requireUser();
  const v = goalSchema.parse(goals).map((g) => ({
    ...g,
    upper: g.direction === "range" ? (g.upper ?? g.target) : null,
  }));
  await saveGoals(user.id, v);
  revalidatePath("/home");
  revalidatePath("/settings/goals");
}

export async function resetGoalsAction() {
  const user = await requireUser();
  const p = await getProfile(user.id);
  if (!p) throw new Error("プロフィールを先に登録してください");
  await resetGoalsFromProfile(user.id, p);
  revalidatePath("/home");
  revalidatePath("/settings/goals");
}

/** 自分のデータとアカウントを削除する(お試しユーザーも本登録ユーザーも) */
export async function deleteAccountAction() {
  const user = await requireUser();
  await auth.api.signOut({ headers: await headers() }).catch(() => {});
  await db.delete(s.user).where(eq(s.user.id, user.id));
  redirect("/");
}

export async function signOutAction() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/");
}

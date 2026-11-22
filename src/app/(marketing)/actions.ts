"use server";

import { count, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/server/auth/auth";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { MAX_GUEST_USERS, seedGuest } from "@/server/services/guest";
import { hashIp, takeToken } from "@/server/services/rate-limit";

export type StartGuestState = { error?: string };

/** 「登録せずに試す」: 匿名ユーザーを作り、サンプルデータを入れてホームへ(§8.1) */
export async function startGuest(): Promise<StartGuestState> {
  const existing = await getCurrentUser();
  if (existing) redirect("/home");

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  if (
    !(await takeToken(
      `guest_create:${hashIp(ip)}`,
      Number(process.env.GUEST_CREATE_LIMIT_PER_HOUR ?? 5),
      60 * 60 * 1000,
    ))
  ) {
    return { error: "お試しの開始回数が上限に達しました。1 時間ほど待ってから、もう一度お試しください。" };
  }
  const [{ n }] = await db.select({ n: count() }).from(s.user).where(eq(s.user.isAnonymous, true));
  if (n >= MAX_GUEST_USERS) {
    return { error: "現在お試しの利用者が多いため、新しく始められません。時間をおいてお試しください。" };
  }

  const res = await auth.api.signInAnonymous({ headers: h });
  if (!res?.user) return { error: "お試しを開始できませんでした。もう一度お試しください。" };
  await seedGuest(res.user.id);
  redirect("/home");
}

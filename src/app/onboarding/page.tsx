import type { Metadata } from "next";

import { Wordmark } from "@/components/wordmark";
import { redirect } from "next/navigation";

import { ProfileForm } from "@/components/profile-form";
import { requireUser } from "@/server/auth/session";
import { getProfile } from "@/server/repositories/profile";

export const metadata: Metadata = { title: "プロフィールの登録" };
export const dynamic = "force-dynamic";

/** 本登録の初回に表示するプロフィール確認(§2.3) */
export default async function OnboardingPage() {
  const user = await requireUser();
  if (await getProfile(user.id)) redirect("/home");
  return (
    <main className="mx-auto grid w-full max-w-2xl gap-4 px-4 py-10">
      <Wordmark />
      <h1 className="text-2xl font-bold">はじめにプロフィールを登録してください</h1>
      <p className="text-sm text-muted-foreground">
        1日の目標(エネルギー・たんぱく質など)を、日本人の食事摂取基準(2025年版)から計算します。あとから設定画面で変えられます。
      </p>
      <div className="rounded-lg border border-border bg-white p-5">
        <ProfileForm
          mode="onboarding"
          initial={{
            birthYearMonth: "",
            sex: "",
            heightCm: "",
            weightKg: "",
            activityLevel: "",
            lifeStage: "none",
            menstruation: false,
          }}
        />
      </div>
    </main>
  );
}

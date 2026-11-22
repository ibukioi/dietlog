import type { Metadata } from "next";

import { requireUser } from "@/server/auth/session";
import { getGoals, getProfile } from "@/server/repositories/profile";

import { GoalsEditor } from "./goals-editor";

export const metadata: Metadata = { title: "1日の目標" };

export default async function GoalsPage() {
  const user = await requireUser();
  const [goals, profile] = await Promise.all([getGoals(user.id), getProfile(user.id)]);
  return (
    <section className="grid max-w-3xl gap-3">
      <p className="text-sm text-muted-foreground">
        初期値はプロフィールと「日本人の食事摂取基準(2025年版)」から計算しています。自由に変更でき、ホームのゲージに反映されます。
      </p>
      <GoalsEditor initial={goals} hasProfile={Boolean(profile)} />
    </section>
  );
}

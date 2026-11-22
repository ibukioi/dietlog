import type { Metadata } from "next";

import { ProfileForm } from "@/components/profile-form";
import { requireUser } from "@/server/auth/session";
import { getProfile } from "@/server/repositories/profile";

export const metadata: Metadata = { title: "プロフィール" };

export default async function ProfilePage() {
  const user = await requireUser();
  const p = await getProfile(user.id);
  return (
    <section className="max-w-2xl rounded-lg border border-border bg-white p-5">
      <ProfileForm
        mode="settings"
        initial={{
          birthYearMonth: p?.birthYearMonth ?? "",
          sex: p?.sex ?? "",
          heightCm: p?.heightCm ?? "",
          weightKg: p?.weightKg ?? "",
          activityLevel: p?.activityLevel ?? "",
          lifeStage: p?.lifeStage ?? "none",
          menstruation: p?.menstruation ?? false,
        }}
      />
    </section>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";

import { AppNav, MobileNav } from "@/components/app-nav";
import { SiteFooter } from "@/components/site-footer";
import { Wordmark } from "@/components/wordmark";
import { requireUser } from "@/server/auth/session";
import { getProfile } from "@/server/repositories/profile";

export const dynamic = "force-dynamic";

function guestDaysLeft(expiresAt: Date | null, now = new Date()): number | null {
  return expiresAt ? Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000)) : null;
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  if (!profile && !user.isAnonymous) {
    // 本登録の初回はプロフィール確認へ(§2.3)
    redirect("/onboarding");
  }
  const days = guestDaysLeft(user.guestExpiresAt);

  return (
    <div className="flex min-h-screen flex-col pb-16 md:pb-0">
      {user.isAnonymous && (
        <div className="bg-[var(--brand-deep)] px-4 py-2 text-center text-xs text-white/90">
          お試しモード: データは{days !== null ? `あと ${days} 日で` : "14 日後に"}自動削除されます。
          <Link href="/settings/account" className="ml-2 font-medium text-white underline underline-offset-2">
            本登録して保存する
          </Link>
        </div>
      )}
      <header className="sticky top-0 z-30 border-b border-border bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
          <Wordmark href="/home" />
          <AppNav />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
      <MobileNav />
      <SiteFooter />
    </div>
  );
}

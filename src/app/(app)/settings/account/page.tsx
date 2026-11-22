import type { Metadata } from "next";

import { isGithubEnabled } from "@/server/auth/auth";
import { requireUser } from "@/server/auth/session";

import { AccountActions } from "./account-actions";

export const metadata: Metadata = { title: "アカウント" };

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <section className="grid max-w-2xl gap-4">
      <div className="grid gap-2 rounded-lg border border-border bg-white p-5">
        <h2 className="font-bold">
          {user.isAnonymous ? "お試しモードで利用中" : `${user.name} さん(GitHub で登録済み)`}
        </h2>
        {user.isAnonymous ? (
          <p className="text-sm text-muted-foreground">
            お試しのデータは{user.guestExpiresAt ? ` ${user.guestExpiresAt.toLocaleDateString("ja-JP")} ごろに` : ""}
            自動で削除されます。GitHub アカウントで本登録すると、これまでの記録を引き継いで使い続けられます。
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">記録は削除するまで保存されます。</p>
        )}
      </div>
      <AccountActions isAnonymous={user.isAnonymous} githubEnabled={isGithubEnabled} />
    </section>
  );
}

"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

import { deleteAccountAction, signOutAction } from "../actions";

export function AccountActions({ isAnonymous, githubEnabled }: { isAnonymous: boolean; githubEnabled: boolean }) {
  const [pending, start] = useTransition();
  const [linking, setLinking] = useState(false);
  return (
    <div className="grid gap-4">
      {isAnonymous && (
        <div className="grid gap-2 rounded-lg border border-border bg-white p-5">
          <h3 className="font-bold">本登録して保存する</h3>
          {githubEnabled ? (
            <>
              <p className="text-sm text-muted-foreground">
                GitHub でログインすると、お試し中の記録・タグ・商品がそのまま引き継がれます。
              </p>
              <div>
                <Button
                  size="lg"
                  disabled={linking}
                  onClick={async () => {
                    setLinking(true);
                    const res = await authClient.signIn.social({ provider: "github", callbackURL: "/home" });
                    if (res?.error) {
                      toast.error("GitHub に接続できませんでした。時間をおいてお試しください。");
                      setLinking(false);
                    }
                  }}
                >
                  GitHub で本登録する
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              この環境では本登録(GitHub ログイン)が設定されていません。お試しモードのまま使えます。
            </p>
          )}
        </div>
      )}

      <div className="grid gap-2 rounded-lg border border-border bg-white p-5">
        <h3 className="font-bold">データの削除</h3>
        <p className="text-sm text-muted-foreground">
          食事の記録・タグ・商品・プロフィールをすべて削除します。元に戻せません。
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => {
              if (!confirm("すべての記録とアカウントを削除します。元に戻せません。よろしいですか?")) return;
              start(() => deleteAccountAction());
            }}
          >
            すべて削除する
          </Button>
          {!isAnonymous && (
            <Button variant="outline" disabled={pending} onClick={() => start(() => signOutAction())}>
              ログアウト
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

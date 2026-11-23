"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function GithubLoginButton({ label }: { label: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function login() {
    setPending(true);
    setError(false);
    const res = await authClient.signIn.social({ provider: "github", callbackURL: "/home" });
    if (res?.error) {
      setError(true);
      setPending(false);
    }
  }

  return (
    <div className="grid gap-2">
      <Button
        type="button"
        variant="outline"
        size="lg"
        disabled={pending}
        onClick={login}
        className="h-12 rounded-full bg-white px-7 text-base"
      >
        {pending ? "GitHub に移動しています…" : label}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          GitHub に接続できませんでした。時間をおいてお試しください。
        </p>
      )}
    </div>
  );
}

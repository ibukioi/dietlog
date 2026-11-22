"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import { type StartGuestState, startGuest } from "./actions";

export function StartGuestButton() {
  const [state, action, pending] = useActionState<StartGuestState>(startGuest, {});
  return (
    <form action={action} className="grid gap-2">
      <Button
        type="submit"
        size="lg"
        disabled={pending}
        className="h-12 rounded-full px-7 text-base shadow-[var(--brand)]/25 shadow-md"
      >
        {pending ? "サンプルデータを準備しています…" : "登録せずに試す"}
      </Button>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}

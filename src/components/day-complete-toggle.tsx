"use client";

import { CheckCircle2, Circle } from "lucide-react";
import { useOptimistic, useTransition } from "react";

import { setDayCompleteAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";

export function DayCompleteToggle({ date, complete }: { date: string; complete: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(complete);
  const [pending, start] = useTransition();
  return (
    <Button
      variant={optimistic ? "secondary" : "outline"}
      disabled={pending}
      aria-pressed={optimistic}
      onClick={() =>
        start(async () => {
          setOptimistic(!optimistic);
          await setDayCompleteAction(date, !optimistic);
        })
      }
    >
      {optimistic ? <CheckCircle2 className="text-[var(--brand)]" /> : <Circle />}
      {optimistic ? "この日の記録は完了" : "この日の記録を完了にする"}
    </Button>
  );
}

"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { deleteRecipeAction } from "./actions";

export function DeleteRecipeButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() => {
        if (!confirm(`タグ「${name}」を削除しますか?(記録済みの食事は残ります)`)) return;
        start(async () => {
          await deleteRecipeAction(id);
          toast.success(`タグ「${name}」を削除しました`);
        });
      }}
    >
      削除
    </Button>
  );
}

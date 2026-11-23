"use client";

import { LogOut } from "lucide-react";
import { useTransition } from "react";

import { signOutAction } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";

export function SignOutButton({
  size = "sm",
  className,
  labelClassName,
}: {
  size?: "sm" | "lg";
  className?: string;
  labelClassName?: string;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      disabled={pending}
      onClick={() => start(() => signOutAction())}
      className={className}
    >
      <LogOut aria-hidden />
      <span className={labelClassName}>{pending ? "ログアウト中…" : "ログアウト"}</span>
    </Button>
  );
}

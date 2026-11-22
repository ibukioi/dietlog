import Link from "next/link";

import { cn } from "@/lib/utils";

/** アプリ名の表示(企業のロゴ・商標は使わない) */
export function Wordmark({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 text-[var(--ink)]", className)}>
      <span aria-hidden className="relative inline-block size-5 rounded-full bg-[var(--brand)]">
        <span className="absolute inset-x-[3px] bottom-[3px] h-[7px] rounded-b-full bg-white/45" />
      </span>
      <span className="font-num text-xl font-semibold tracking-tight">dietlog</span>
    </Link>
  );
}

"use client";

import { BarChart3, BookOpen, Home, NotebookPen, Package, Settings, Tags } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/home", label: "ホーム", icon: Home, mobile: true },
  { href: "/log", label: "記録する", icon: NotebookPen, mobile: true },
  { href: "/history", label: "履歴", icon: BookOpen, mobile: true },
  { href: "/recipes", label: "タグ", icon: Tags, mobile: false },
  { href: "/products", label: "商品", icon: Package, mobile: false },
  { href: "/analysis", label: "分析", icon: BarChart3, mobile: true },
  { href: "/settings", label: "設定", icon: Settings, mobile: true },
] as const;

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

/** PC: ヘッダー内のナビ */
export function AppNav() {
  const active = useActive();
  return (
    <nav aria-label="メイン" className="hidden md:flex md:items-center md:gap-1">
      {ITEMS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={active(href) ? "page" : undefined}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm text-muted-foreground transition-colors hover:text-[var(--ink)]",
            active(href) && "bg-[var(--brand-soft)] font-medium text-[var(--brand-deep)]",
          )}
        >
          <Icon className="size-4" aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * スマホ: 画面下部の固定ナビ。
 * ヘッダー(backdrop-filter で fixed の基準になる)の外に置くこと
 */
export function MobileNav() {
  const active = useActive();
  return (
    <nav
      aria-label="メイン(モバイル)"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {ITEMS.filter((i) => i.mobile).map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={active(href) ? "page" : undefined}
          className={cn(
            "flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground",
            active(href) && "font-medium text-[var(--brand)]",
          )}
        >
          <Icon className="size-5" aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  );
}

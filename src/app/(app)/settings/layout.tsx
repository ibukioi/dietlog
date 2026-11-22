import Link from "next/link";

const TABS = [
  { href: "/settings/profile", label: "プロフィール" },
  { href: "/settings/goals", label: "1日の目標" },
  { href: "/settings/account", label: "アカウント" },
];

// スマホの下部ナビに入らない画面への入口
const MOBILE_EXTRA = [
  { href: "/recipes", label: "自炊のタグ" },
  { href: "/products", label: "自分の商品" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-5">
      <h1 className="text-2xl font-bold tracking-tight">設定</h1>
      <nav aria-label="設定" className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <nav aria-label="そのほかの画面" className="flex gap-2 md:hidden">
        {MOBILE_EXTRA.map((t) => (
          <Link key={t.href} href={t.href} className="rounded-md border border-border bg-white px-3 py-1.5 text-sm">
            {t.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}

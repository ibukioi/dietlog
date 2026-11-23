import Link from "next/link";

const TABS = [
  { href: "/settings/profile", label: "プロフィール" },
  { href: "/settings/goals", label: "1日の目標" },
  { href: "/settings/account", label: "アカウント" },
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
      {children}
    </div>
  );
}

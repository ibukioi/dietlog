import Link from "next/link";
import { Suspense } from "react";

import { Broccoli, Fish, Onigiri, RiceBowl, Tomato } from "@/components/food-illustrations";
import { HpGauge } from "@/components/hp-gauge";
import { SiteFooter } from "@/components/site-footer";
import { Wordmark } from "@/components/wordmark";
import { buttonVariants } from "@/components/ui/button";
import { gaugeState } from "@/domain/goals/goals";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/server/auth/session";

import { StartGuestButton } from "./start-guest-button";

const demo = [
  gaugeState(
    { nutrientCode: "ENERC_KCAL", target: 1990, direction: "at_most", upper: null, showOnHome: true, displayOrder: 0 },
    { sum: 1420, unknownItems: 0, items: 6 },
  ),
  gaugeState(
    { nutrientCode: "PROT-", target: 65, direction: "at_least", upper: null, showOnHome: true, displayOrder: 1 },
    { sum: 68.4, unknownItems: 0, items: 6 },
  ),
  gaugeState(
    { nutrientCode: "FAT-", target: 44, direction: "range", upper: 66, showOnHome: true, displayOrder: 2 },
    { sum: 41.2, unknownItems: 0, items: 6 },
  ),
  gaugeState(
    { nutrientCode: "NACL_EQ", target: 6.5, direction: "at_most", upper: null, showOnHome: true, displayOrder: 3 },
    { sum: 7.3, unknownItems: 1, items: 6 },
  ),
];

async function ContinueLink() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <Link
      href="/home"
      className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-12 rounded-full bg-white px-7 text-base")}
    >
      続きから使う
    </Link>
  );
}

const FEATURES = [
  {
    Icon: RiceBowl,
    title: "自炊は食材と調理法から",
    body: "成分表に「ゆで」「焼き」などの調理後データがある食材はそれを優先。ない食材は重量変化率と吸油量で補正し、油と調味料を加えて計算します。よく作る料理はタグに保存してワンタップで記録できます。",
  },
  {
    Icon: Onigiri,
    title: "外食・市販品は検索か手入力",
    body: "市販品は Open Food Facts を検索、ブランドのない料理は成分表の「目安値」から選べます。見つからなければパッケージの表示を手入力。一度記録した商品は自分の商品リストから呼び出せます。",
  },
  {
    Icon: Broccoli,
    title: "1週間の栄養バランス",
    body: "直近7日間の平均を日本人の食事摂取基準(2025年版)と比べます。記録が5日に満たないときや、商品データにビタミン・ミネラルの記載がないときは「判定不可」として区別します。",
  },
];

export default function LandingPage() {
  const [energy, ...rest] = demo;
  return (
    <>
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <Wordmark />
          <Link href="/about" className="text-sm text-muted-foreground hover:text-[var(--ink)]">
            出典・注意事項
          </Link>
        </div>
      </header>
      <main className="flex-1">
        <section className="overflow-hidden bg-[var(--brand-soft)]">
          <div className="mx-auto grid max-w-5xl items-center gap-12 px-4 py-16 md:grid-cols-[1.1fr_1fr] md:py-24">
            <div className="grid gap-7">
              <h1 className="text-[1.6rem] leading-[1.45] font-bold tracking-tight text-[var(--ink)] sm:text-[1.85rem] lg:text-[2.6rem]">
                <span className="inline-block">自炊も、外食も。</span>{" "}
                <span className="inline-block">今日の栄養を、ひと目で。</span>
              </h1>
              <p className="max-w-[34em] leading-loose text-[var(--ink-soft)]">
                食材の重さと調理法を選ぶと、日本食品標準成分表の「ゆで」「油いため」などの調理後データで計算します。外食や市販品は商品検索か手入力で。1日の目標に対して、いまどれだけ摂れたかを確認できます。
              </p>
              <div className="flex flex-wrap items-start gap-3">
                <StartGuestButton />
                <Suspense>
                  <ContinueLink />
                </Suspense>
              </div>
              <p className="text-xs text-[var(--ink-soft)]">
                登録は不要です。6 日分のサンプル記録が入った状態で始まり、データは 14 日後に自動で削除されます。
              </p>
            </div>

            <div className="relative mx-2 md:mx-6">
              <Onigiri className="absolute -top-9 -left-7 z-10 size-16 -rotate-12 md:-top-11 md:-left-12 md:size-20" />
              <Tomato className="absolute -top-8 -right-4 z-10 size-14 rotate-12 md:-top-10 md:-right-10 md:size-[72px]" />
              <Fish className="absolute -bottom-7 -left-6 z-10 w-20 -rotate-6 md:-left-14 md:w-24" />
              <Broccoli className="absolute -right-5 -bottom-9 z-10 size-16 rotate-6 md:-right-11 md:size-20" />
              <div
                className="grid gap-6 rounded-[20px] border border-[#d0e4f2] bg-white p-6 shadow-[0_20px_50px_-30px_rgba(11,95,149,0.45)]"
                aria-label="ホーム画面の表示例"
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium text-[var(--brand-deep)]">今日の摂取量</span>
                  <span className="text-xs text-muted-foreground">表示例</span>
                </div>
                <HpGauge gauge={energy} variant="hero" />
                <div className="grid gap-5">
                  {rest.map((g) => (
                    <HpGauge key={g.nutrientCode} gauge={g} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-5xl gap-10 px-4 py-16 md:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="grid content-start gap-3 border-t-2 border-[var(--brand)] pt-5">
              <f.Icon className="size-12" />
              <h2 className="font-bold">{f.title}</h2>
              <p className="text-sm leading-loose text-[var(--ink-soft)]">{f.body}</p>
            </div>
          ))}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Fish } from "@/components/food-illustrations";
import { DayCompleteToggle } from "@/components/day-complete-toggle";
import { HpGauge, formatAmount } from "@/components/hp-gauge";
import { MealSection } from "@/components/meal-list";
import { buttonVariants } from "@/components/ui/button";
import { nutrientLabel, nutrientDef } from "@/domain/nutrients/catalog";
import { cn } from "@/lib/utils";
import { MEAL_TYPES, formatJaDate, isIsoDate, shiftIso, todayIso } from "@/lib/dates";
import { requireUser } from "@/server/auth/session";
import { getDaySummary } from "@/server/services/daily";

export const metadata: Metadata = { title: "ホーム" };

export default async function HomePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await requireUser();
  const { date: qd } = await searchParams;
  const today = todayIso();
  const date = isIsoDate(qd) && qd <= today ? qd : today;
  const day = await getDaySummary(user.id, date);
  const homeGauges = day.gauges.filter((g) => g.goal.showOnHome);
  const subGauges = day.gauges.filter((g) => !g.goal.showOnHome).slice(0, 6);

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Link
            href={`/home?date=${shiftIso(date, -1)}`}
            className={buttonVariants({ variant: "ghost", size: "icon" })}
            aria-label="前の日"
          >
            <ChevronLeft />
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">
            {date === today ? "今日" : formatJaDate(date)}
            {date === today && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">{formatJaDate(date)}</span>
            )}
          </h1>
          {date < today && (
            <Link
              href={`/home?date=${shiftIso(date, 1)}`}
              className={buttonVariants({ variant: "ghost", size: "icon" })}
              aria-label="次の日"
            >
              <ChevronRight />
            </Link>
          )}
        </div>
        <Link href={`/log?date=${date}`} className={cn(buttonVariants(), "hidden rounded-full px-4 md:inline-flex")}>
          <Plus /> 記録する
        </Link>
      </div>

      <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <section className="status-window relative grid gap-6 overflow-hidden p-6" aria-labelledby="status-title">
          <Fish className="pointer-events-none absolute -right-3 -bottom-2 w-24 rotate-[-8deg] opacity-90" />
          <div className="flex items-baseline justify-between">
            <h2 id="status-title" className="text-sm font-medium text-[var(--brand-deep)]">
              {date === today ? "きょうの摂取量" : "この日の摂取量"}
            </h2>
            <Link href="/settings/goals" className="text-xs text-muted-foreground underline underline-offset-2">
              目標を変える
            </Link>
          </div>
          {homeGauges.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              目標が設定されていません。
              <Link href="/settings/profile" className="underline">
                プロフィール
              </Link>
              から目標を作れます。
            </p>
          ) : (
            <>
              {homeGauges
                .filter(({ state }) => state.nutrientCode === "ENERC_KCAL")
                .map(({ state }) => (
                  <HpGauge key={state.nutrientCode} gauge={state} variant="hero" />
                ))}
              <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
                {homeGauges
                  .filter(({ state }) => state.nutrientCode !== "ENERC_KCAL")
                  .map(({ state }) => (
                    <HpGauge key={state.nutrientCode} gauge={state} />
                  ))}
              </div>
            </>
          )}
          {subGauges.length > 0 && (
            <details className="group border-t border-[#d0e4f2] pt-4">
              <summary className="cursor-pointer text-sm text-muted-foreground">ビタミン・ミネラル</summary>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {subGauges.map(({ state }) => {
                  const unit = nutrientDef(state.nutrientCode).unit;
                  return (
                    <div key={state.nutrientCode} className="flex justify-between gap-2">
                      <dt>{nutrientLabel(state.nutrientCode)}</dt>
                      <dd className="tabular-nums">
                        {formatAmount(state.intake, unit)}
                        <span className="text-muted-foreground">
                          /{formatAmount(state.target, unit)}
                          {unit}
                        </span>
                        {state.hasUnknown && <span className="text-muted-foreground">*</span>}
                      </dd>
                    </div>
                  );
                })}
              </dl>
              <p className="mt-2 text-xs text-muted-foreground">
                * 記載のない食品を含むため、実際より少なく表示されている可能性があります
              </p>
            </details>
          )}
        </section>

        <div className="grid gap-3">
          {MEAL_TYPES.map((m) => (
            <MealSection
              key={m}
              date={date}
              mealType={m}
              items={day.byMeal.get(m)!.map((i) => ({
                id: i.id,
                name: i.nameSnapshot,
                quantity: i.quantity,
                unit: i.unit,
                energyKcal: i.energyKcal,
                proteinG: i.proteinG,
                sourceLabel: i.sourceLabel,
                isEstimate: i.isEstimate,
              }))}
            />
          ))}
          <div className="flex justify-end">
            <DayCompleteToggle date={date} complete={day.isComplete} />
          </div>
        </div>
      </div>

      <Link
        href={`/log?date=${date}`}
        className="fixed right-4 bottom-20 z-30 inline-flex size-14 items-center justify-center rounded-full bg-[var(--brand)] text-white shadow-[var(--brand)]/30 shadow-lg md:hidden"
        aria-label="記録する"
      >
        <Plus className="size-6" />
      </Link>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

import { formatAmount } from "@/components/hp-gauge";
import type { NutrientResult, Verdict } from "@/domain/analysis/analyze";
import {
  DISCLAIMER,
  EXCLUDED_MESSAGE,
  LIMITATION,
  PENDING_MESSAGE,
  TIPS_HEADING,
  TIPS_LEAD,
  VERDICT_DESCRIPTION,
  VERDICT_LABEL,
} from "@/domain/copy/analysis-copy";
import { DRI_UNITS } from "@/domain/dri/dri";
import { nutrientLabel } from "@/domain/nutrients/catalog";
import { formatJaDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/session";
import { getWeeklyAnalysis } from "@/server/services/analysis";
import { EmptyIllustration } from "@/components/food-illustrations";

export const metadata: Metadata = { title: "栄養バランス" };

const ORDER: Verdict[] = [
  "deficient",
  "slightly_low",
  "below_ai",
  "below_dg",
  "above_dg",
  "insufficient_data",
  "adequate",
];

const PILL: Record<Verdict, string> = {
  deficient: "bg-[#fde8ea] text-[#b4313b]",
  slightly_low: "bg-[#fdf1de] text-[#9a6412]",
  below_ai: "bg-[#eef1f4] text-[var(--ink-soft)]",
  below_dg: "bg-[#fdf1de] text-[#9a6412]",
  above_dg: "bg-[#fde8ea] text-[#b4313b]",
  insufficient_data: "bg-[#f1f4f6] text-[var(--ink-soft)]",
  adequate: "bg-[var(--brand-soft)] text-[var(--brand-deep)]",
};

function reference(n: NutrientResult, unit: string) {
  const r = n.reference;
  if (n.kind === "ear_rda") return `推定平均必要量 ${r.ear}${unit} / 推奨量 ${r.rda}${unit}`;
  if (n.kind === "ai") return `目安量 ${r.ai}${unit}${r.dgLower ? ` / 目標量 ${r.dgLower}${unit}以上` : ""}`;
  if (n.kind === "dg_upper") return `目標量 ${r.dgUpper}${unit}未満`;
  return `目標量 ${r.dgLower}${unit}以上`;
}

export default async function AnalysisPage() {
  const user = await requireUser();
  const data = await getWeeklyAnalysis(user.id);

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">1週間の栄養バランス</h1>
        <p className="text-sm text-muted-foreground">
          直近7日間(今日を除く)の記録の平均を、日本人の食事摂取基準(2025年版)と比べた参考情報です。
        </p>
      </div>

      {data.status === "no_profile" ? (
        <p className="rounded-lg border border-border bg-white p-5 text-sm">
          分析にはプロフィールが必要です。
          <Link href="/settings/profile" className="underline">
            プロフィールを登録する
          </Link>
        </p>
      ) : data.result.status === "excluded" ? (
        <p className="rounded-lg border border-border bg-white p-5 text-sm">{EXCLUDED_MESSAGE[data.result.reason]}</p>
      ) : data.result.status === "pending" ? (
        <div className="grid gap-3 rounded-2xl border border-border bg-white p-6">
          <div className="flex items-center gap-4">
            <EmptyIllustration />
            <p className="font-bold">分析を保留しています</p>
          </div>
          <p className="text-sm">{PENDING_MESSAGE(data.result.requiredDays - data.result.recordedDays)}</p>
          <p className="text-xs text-muted-foreground">
            記録日の数え方:
            3食以上(朝・昼・夕・間食のうち3つ)に記録がある日、またはホームで「この日の記録を完了にする」を押した日。現在{" "}
            {data.result.recordedDays} 日。
          </p>
          <div>
            <Link href="/log" className="text-sm underline">
              記録する
            </Link>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm">
            対象: {formatJaDate(data.result.window.from)} 〜 {formatJaDate(data.result.window.to)}(記録{" "}
            {data.result.recordedDays} 日)
            {data.trend.evaluatedWeeks <= 1 && (
              <span className="ml-2 text-muted-foreground">記録が1週分のため、結果は参考程度に見てください。</span>
            )}
          </p>
          <ul className="grid gap-3">
            {[...data.result.nutrients]
              .sort((a, b) => ORDER.indexOf(a.verdict) - ORDER.indexOf(b.verdict))
              .map((n) => {
                const unit = DRI_UNITS[n.code] ?? "";
                const tips = data.tips[n.code];
                const lowWeeks = data.trend.lowWeeks[n.code] ?? 0;
                return (
                  <li key={n.code} className="grid gap-2 rounded-2xl border border-border bg-white p-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="flex items-center gap-2.5 font-bold">
                        {nutrientLabel(n.code)}
                        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", PILL[n.verdict])}>
                          {VERDICT_LABEL[n.verdict]}
                        </span>
                      </p>
                      {n.verdict !== "insufficient_data" && (
                        <p className="text-sm tabular-nums">
                          1日平均 <span className="font-num text-xl font-light">{formatAmount(n.average, unit)}</span>{" "}
                          {unit}
                        </p>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{VERDICT_DESCRIPTION[n.verdict]}</p>
                    <p className="text-xs text-muted-foreground">
                      基準: {reference(n, unit)}(食事摂取基準 2025年版「{n.sourceRef}」)・データのある記録の割合{" "}
                      {Math.round(n.coverage * 100)}%
                      {n.verdict !== "insufficient_data" &&
                        n.coverage < 0.995 &&
                        `(データのない食品の分はエネルギー比で補って平均。補正前 ${formatAmount(n.knownAverage, unit)}${unit})`}
                      {data.trend.evaluatedWeeks >= 2 && lowWeeks > 0 && `・直近4週のうち ${lowWeeks} 週で推奨量未満`}
                    </p>
                    {tips && tips.length > 0 && (
                      <details className="text-sm">
                        <summary className="cursor-pointer text-[var(--brand)]">{TIPS_HEADING}</summary>
                        <p className="mt-2 text-xs text-muted-foreground">{TIPS_LEAD}</p>
                        <ul className="mt-1 grid gap-0.5">
                          {tips.map((t) => (
                            <li key={t.name} className="flex justify-between gap-3">
                              <span>{t.name}</span>
                              <span className="text-muted-foreground tabular-nums">
                                {t.value} {unit}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </li>
                );
              })}
          </ul>
          <p className="text-xs text-muted-foreground">{LIMITATION}</p>
        </>
      )}

      <p className="rounded-lg bg-muted px-4 py-3 text-xs leading-relaxed text-muted-foreground">{DISCLAIMER}</p>
    </div>
  );
}

import { format, parseISO } from "date-fns";
import type { Metadata } from "next";
import Link from "next/link";

import { CORE } from "@/domain/nutrients/catalog";
import { rangeIso, shiftIso, todayIso, formatJaDate } from "@/lib/dates";
import { requireUser } from "@/server/auth/session";
import { listItemsInRange } from "@/server/repositories/meals";
import { getGoals } from "@/server/repositories/profile";

import { EnergyChart, type HistoryPoint, PfcChart } from "./history-chart";

export const metadata: Metadata = { title: "履歴" };

function r(n: number, d = 0) {
  return Math.round(n * 10 ** d) / 10 ** d;
}

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await requireUser();
  const { view } = await searchParams;
  const weekly = view === "weekly";
  const today = todayIso();
  const days = weekly ? 56 : 14;
  const from = shiftIso(today, -(days - 1));
  const [items, goals] = await Promise.all([listItemsInRange(user.id, from, today), getGoals(user.id)]);
  const energyGoal = goals.find((g) => g.nutrientCode === CORE.energy)?.target ?? null;

  const perDay = new Map<
    string,
    { kcal: number; protein: number; fat: number; carb: number; salt: number; n: number }
  >();
  for (const d of rangeIso(from, today)) perDay.set(d, { kcal: 0, protein: 0, fat: 0, carb: 0, salt: 0, n: 0 });
  for (const i of items) {
    const p = perDay.get(i.eatenOn);
    if (!p) continue;
    p.kcal += i.energyKcal ?? 0;
    p.protein += i.proteinG ?? 0;
    p.fat += i.fatG ?? 0;
    p.carb += i.carbG ?? 0;
    p.salt += i.saltG ?? 0;
    p.n += 1;
  }
  const dayRows = [...perDay.entries()].map(([date, v]) => ({ date, ...v }));

  // 週別: 記録のある日の平均(未記録日を 0 として平均しない)
  const weeks: Array<{
    label: string;
    from: string;
    to: string;
    days: number;
    kcal: number;
    protein: number;
    fat: number;
    carb: number;
    salt: number;
  }> = [];
  if (weekly) {
    for (let w = 7; w >= 0; w--) {
      const to = shiftIso(today, -7 * w);
      const fr = shiftIso(to, -6);
      const rows = dayRows.filter((d) => d.date >= fr && d.date <= to && d.n > 0);
      const avg = (k: "kcal" | "protein" | "fat" | "carb" | "salt") =>
        rows.length ? rows.reduce((s, x) => s + x[k], 0) / rows.length : 0;
      weeks.push({
        label: `${format(parseISO(fr), "M/d")}〜`,
        from: fr,
        to,
        days: rows.length,
        kcal: avg("kcal"),
        protein: avg("protein"),
        fat: avg("fat"),
        carb: avg("carb"),
        salt: avg("salt"),
      });
    }
  }

  const chartData: HistoryPoint[] = weekly
    ? weeks.map((w) => ({
        label: w.label,
        kcal: r(w.kcal),
        protein: r(w.protein, 1),
        fat: r(w.fat, 1),
        carb: r(w.carb, 1),
      }))
    : dayRows.map((d) => ({
        label: format(parseISO(d.date), "M/d"),
        kcal: r(d.kcal),
        protein: r(d.protein, 1),
        fat: r(d.fat, 1),
        carb: r(d.carb, 1),
      }));

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">履歴</h1>
        <nav aria-label="表示の切り替え" className="inline-flex rounded-lg bg-muted p-[3px] text-sm">
          {[
            { href: "/history", label: "日別(14日)", active: !weekly },
            { href: "/history?view=weekly", label: "週別(8週)", active: weekly },
          ].map((t) => (
            <Link
              key={t.href}
              href={t.href}
              aria-current={t.active ? "page" : undefined}
              className={
                t.active
                  ? "rounded-md bg-white px-3 py-1 font-medium shadow-sm"
                  : "rounded-md px-3 py-1 text-muted-foreground"
              }
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid gap-6 rounded-lg border border-border bg-white p-4 md:grid-cols-2">
        <EnergyChart
          data={chartData}
          target={energyGoal}
          title={weekly ? "1日平均のエネルギー(週ごと)" : "1日のエネルギー"}
        />
        <PfcChart
          data={chartData}
          title={weekly ? "1日平均のたんぱく質・脂質・炭水化物(g)" : "たんぱく質・脂質・炭水化物(g)"}
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-white">
        <table className="w-full min-w-[560px] text-sm">
          <caption className="sr-only">{weekly ? "週別の 1 日平均" : "日別の合計"}</caption>
          <thead className="border-b border-border text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">{weekly ? "週" : "日付"}</th>
              {weekly && <th className="px-3 py-2 text-right font-medium">記録日数</th>}
              <th className="px-3 py-2 text-right font-medium">エネルギー</th>
              <th className="px-3 py-2 text-right font-medium">たんぱく質</th>
              <th className="px-3 py-2 text-right font-medium">脂質</th>
              <th className="px-3 py-2 text-right font-medium">炭水化物</th>
              <th className="px-3 py-2 text-right font-medium">食塩</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border tabular-nums">
            {weekly
              ? [...weeks].reverse().map((w) => (
                  <tr key={w.from}>
                    <td className="px-3 py-2">
                      {format(parseISO(w.from), "M/d")}〜{format(parseISO(w.to), "M/d")}
                    </td>
                    <td className="px-3 py-2 text-right">{w.days} 日</td>
                    <td className="px-3 py-2 text-right">{w.days ? `${r(w.kcal)} kcal` : "—"}</td>
                    <td className="px-3 py-2 text-right">{w.days ? `${r(w.protein, 1)} g` : "—"}</td>
                    <td className="px-3 py-2 text-right">{w.days ? `${r(w.fat, 1)} g` : "—"}</td>
                    <td className="px-3 py-2 text-right">{w.days ? `${r(w.carb, 1)} g` : "—"}</td>
                    <td className="px-3 py-2 text-right">{w.days ? `${r(w.salt, 1)} g` : "—"}</td>
                  </tr>
                ))
              : [...dayRows].reverse().map((d) => (
                  <tr key={d.date}>
                    <td className="px-3 py-2">
                      <Link href={`/home?date=${d.date}`} className="underline underline-offset-2">
                        {formatJaDate(d.date)}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right">{d.n ? `${r(d.kcal)} kcal` : "—"}</td>
                    <td className="px-3 py-2 text-right">{d.n ? `${r(d.protein, 1)} g` : "—"}</td>
                    <td className="px-3 py-2 text-right">{d.n ? `${r(d.fat, 1)} g` : "—"}</td>
                    <td className="px-3 py-2 text-right">{d.n ? `${r(d.carb, 1)} g` : "—"}</td>
                    <td className="px-3 py-2 text-right">{d.n ? `${r(d.salt, 1)} g` : "—"}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {weekly && (
        <p className="text-xs text-muted-foreground">
          週ごとの値は、記録のある日だけの 1 日平均です(記録のない日を 0 として平均しません)。
        </p>
      )}
    </div>
  );
}

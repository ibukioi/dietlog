"use client";

import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";

import { deleteMealItemAction } from "@/app/(app)/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MEAL_TYPE_LABEL, type MealType } from "@/lib/dates";
import { MealIcon } from "@/components/food-illustrations";

export interface MealListItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  energyKcal: number | null;
  proteinG: number | null;
  sourceLabel: string | null;
  isEstimate: boolean;
}

function fmt(n: number | null, digits = 0) {
  return n === null ? "—" : n.toLocaleString("ja-JP", { maximumFractionDigits: digits });
}

function ItemRow({ item, editable }: { item: MealListItem; editable: boolean }) {
  const [pending, start] = useTransition();
  return (
    <li className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="truncate">{item.name}</p>
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>
            {fmt(item.quantity, 1)} {item.unit}
          </span>
          {item.sourceLabel && (
            <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">
              {item.sourceLabel}
            </Badge>
          )}
          {item.isEstimate && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal">
              目安値
            </Badge>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="text-right">
          <p className="font-num tabular-nums">{fmt(item.energyKcal)} kcal</p>
          <p className="text-xs text-muted-foreground tabular-nums">P {fmt(item.proteinG, 1)} g</p>
        </div>
        {editable && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${item.name}を削除`}
            disabled={pending}
            onClick={() =>
              start(async () => {
                await deleteMealItemAction(item.id);
                toast.success(`${item.name}を削除しました`);
              })
            }
          >
            <Trash2 />
          </Button>
        )}
      </div>
    </li>
  );
}

export function MealSection({
  date,
  mealType,
  items,
  editable = true,
}: {
  date: string;
  mealType: MealType;
  items: MealListItem[];
  editable?: boolean;
}) {
  const kcal = items.reduce((s, i) => s + (i.energyKcal ?? 0), 0);
  return (
    <section className="rounded-2xl border border-border bg-white px-5 py-4" aria-labelledby={`meal-${mealType}`}>
      <div className="flex items-center justify-between">
        <h3 id={`meal-${mealType}`} className="flex items-center gap-2 font-bold">
          <span className="inline-flex size-9 items-center justify-center rounded-full bg-[var(--brand-soft)]">
            <MealIcon mealType={mealType} className="size-7" />
          </span>
          {MEAL_TYPE_LABEL[mealType]}
          <span className="ml-2 font-num text-sm font-normal text-muted-foreground">{fmt(kcal)} kcal</span>
        </h3>
        {editable && (
          <Link
            href={`/log?date=${date}&meal=${mealType}`}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm text-[var(--brand)] hover:bg-[var(--brand-soft)]"
          >
            <Plus className="size-4" aria-hidden />
            記録する
          </Link>
        )}
      </div>
      {items.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">まだ記録がありません</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((i) => (
            <ItemRow key={i.id} item={i} editable={editable} />
          ))}
        </ul>
      )}
    </section>
  );
}

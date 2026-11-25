"use client";

import { Camera, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";

import { deleteMealItemAction } from "@/app/(app)/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MEAL_TYPE_LABEL, type MealType } from "@/lib/dates";
import { type EditableItem, useMealItemEditor } from "@/components/edit-meal-item";
import { MealIcon } from "@/components/food-illustrations";

export interface MealListItem extends EditableItem {
  sourceLabel: string | null;
  isEstimate: boolean;
}

function fmt(n: number | null, digits = 0) {
  return n === null ? "—" : n.toLocaleString("ja-JP", { maximumFractionDigits: digits });
}

function ItemRow({ item, editable, today }: { item: MealListItem; editable: boolean; today: string }) {
  const [pending, start] = useTransition();
  const editor = useMealItemEditor(item, today);
  return (
    <li className="flex items-start gap-3 py-2">
      <MealThumb item={item} onOpen={editable ? editor.open : undefined} />
      <div className="min-w-0 flex-1">
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
      <div className="flex shrink-0 items-center gap-1">
        <div className="text-right">
          <p className="font-num tabular-nums">{fmt(item.energyKcal)} kcal</p>
          <p className="text-xs text-muted-foreground tabular-nums">P {fmt(item.proteinG, 1)} g</p>
        </div>
        {editable && (
          <Button variant="ghost" size="icon-sm" aria-label={`${item.name}を編集`} onClick={editor.open}>
            <Pencil />
          </Button>
        )}
        {editor.dialog}
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

/** 記録の前に出す小さな写真。写真がなければ追加用の枠(編集できる一覧だけ) */
function MealThumb({ item, onOpen }: { item: MealListItem; onOpen?: () => void }) {
  const frame = "size-11 shrink-0 overflow-hidden rounded-lg";
  const img = item.photoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- 本人だけが取得できる API の画像なので next/image の最適化は使わない
    <img src={item.photoUrl} alt="" loading="lazy" className="size-full object-cover" />
  ) : null;
  if (!onOpen) return img ? <div className={`${frame} border border-border`}>{img}</div> : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={item.photoUrl ? `${item.name}の写真を見る` : `${item.name}に写真を追加`}
      className={
        item.photoUrl
          ? `${frame} border border-border`
          : `${frame} flex items-center justify-center border border-dashed border-input bg-[var(--brand-soft)]/40 text-muted-foreground hover:border-[var(--brand)] hover:text-[var(--brand)]`
      }
    >
      {img ?? <Camera className="size-4" aria-hidden />}
    </button>
  );
}

export function MealSection({
  date,
  mealType,
  items,
  editable = true,
  today,
}: {
  date: string;
  mealType: MealType;
  items: MealListItem[];
  editable?: boolean;
  today: string;
}) {
  const kcal = items.reduce((s, i) => s + (i.energyKcal ?? 0), 0);
  return (
    <section
      className="min-w-0 rounded-2xl border border-border bg-white px-5 py-4"
      aria-labelledby={`meal-${mealType}`}
    >
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
            <ItemRow key={i.id} item={i} editable={editable} today={today} />
          ))}
        </ul>
      )}
    </section>
  );
}

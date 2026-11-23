"use client";

import { ChefHat, Pencil } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { updateMealItemAction } from "@/app/(app)/actions";
import { Field, NativeSelect, parseNum } from "@/components/form-bits";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MEAL_TYPES, MEAL_TYPE_LABEL, type MealType } from "@/lib/dates";
import { cn } from "@/lib/utils";

export interface EditableItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  date: string;
  mealType: MealType;
  kind: "product" | "mext_dish" | "home_cooked" | "manual";
  /** 自炊の材料・分量から編集できるか */
  cookEditable: boolean;
  energyKcal: number | null;
  proteinG: number | null;
  fatG: number | null;
  carbG: number | null;
  saltG: number | null;
}

const CORE_FIELDS = [
  { code: "ENERC_KCAL", key: "energyKcal", label: "エネルギー(kcal)" },
  { code: "PROT-", key: "proteinG", label: "たんぱく質(g)" },
  { code: "FAT-", key: "fatG", label: "脂質(g)" },
  { code: "CHOCDF-", key: "carbG", label: "炭水化物(g)" },
  { code: "NACL_EQ", key: "saltG", label: "食塩相当量(g)" },
] as const;

const str = (n: number | null) => (n === null ? "" : String(Math.round(n * 10) / 10));

/** 記録した食事の編集(名前・日付・食事区分・量。手入力の記録は栄養値も) */
export function EditMealItemButton({ item, today }: { item: EditableItem; today: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(item.name);
  const [date, setDate] = useState(item.date);
  const [mealType, setMealType] = useState<MealType>(item.mealType);
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [core, setCore] = useState<Record<string, string>>(() =>
    Object.fromEntries(CORE_FIELDS.map((f) => [f.code, str(item[f.key])])),
  );
  const [pending, start] = useTransition();
  const isManual = item.kind === "manual";
  const q = parseNum(quantity);

  function reset() {
    setName(item.name);
    setDate(item.date);
    setMealType(item.mealType);
    setQuantity(String(item.quantity));
    setCore(Object.fromEntries(CORE_FIELDS.map((f) => [f.code, str(item[f.key])])));
  }

  function save() {
    if (!name.trim()) return toast.error("名前を入力してください");
    if (!q || q <= 0) return toast.error("量を入力してください");
    // 手入力の記録で、量を変えずに栄養値を書き換えたときだけ栄養値を送る
    const coreChanged = isManual && CORE_FIELDS.some((f) => core[f.code] !== str(item[f.key])) && q === item.quantity;
    start(async () => {
      await updateMealItemAction({
        id: item.id,
        name: name.trim(),
        date,
        mealType,
        quantity: q,
        core: coreChanged ? Object.fromEntries(CORE_FIELDS.map((f) => [f.code, parseNum(core[f.code])])) : undefined,
      });
      toast.success(`${name.trim()}を更新しました`);
      setOpen(false);
    });
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`${item.name}を編集`}
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <Pencil />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>記録を編集</DialogTitle>
            <DialogDescription>量を変えると、栄養値も同じ割合で増減します。</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <Field label="名前" htmlFor={`edit-name-${item.id}`}>
              <Input
                id={`edit-name-${item.id}`}
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="日付" htmlFor={`edit-date-${item.id}`}>
                <Input
                  id={`edit-date-${item.id}`}
                  type="date"
                  max={today}
                  value={date}
                  onChange={(e) => e.target.value && setDate(e.target.value)}
                />
              </Field>
              <Field label="食事" htmlFor={`edit-meal-${item.id}`}>
                <NativeSelect
                  id={`edit-meal-${item.id}`}
                  value={mealType}
                  onChange={(e) => setMealType(e.target.value as MealType)}
                >
                  {MEAL_TYPES.map((m) => (
                    <option key={m} value={m}>
                      {MEAL_TYPE_LABEL[m]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <Field label={`量(${item.unit})`} htmlFor={`edit-qty-${item.id}`}>
              <Input
                id={`edit-qty-${item.id}`}
                inputMode="decimal"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </Field>

            {isManual && (
              <fieldset className="grid gap-2" disabled={q !== item.quantity}>
                <legend className="mb-1 text-sm font-medium">栄養値(食べた分)</legend>
                <div className="grid grid-cols-2 gap-3">
                  {CORE_FIELDS.map((f) => (
                    <Field key={f.code} label={f.label} htmlFor={`edit-${f.code}-${item.id}`}>
                      <Input
                        id={`edit-${f.code}-${item.id}`}
                        inputMode="decimal"
                        placeholder="記載なし"
                        value={core[f.code]}
                        onChange={(e) => setCore({ ...core, [f.code]: e.target.value })}
                      />
                    </Field>
                  ))}
                </div>
                {q !== item.quantity && (
                  <p className="text-xs text-muted-foreground">量を変えるときは、栄養値は自動で増減します。</p>
                )}
              </fieldset>
            )}

            {item.kind === "home_cooked" && (
              <div className="rounded-xl bg-[var(--brand-soft)] p-3 text-sm">
                {item.cookEditable ? (
                  <Link
                    href={`/log?tab=cook&editItem=${item.id}`}
                    className={cn(buttonVariants({ variant: "outline" }), "w-full bg-white")}
                  >
                    <ChefHat /> 材料・分量から編集する
                  </Link>
                ) : (
                  <p className="text-muted-foreground">
                    この記録は材料の情報が残っていないため、名前・日付・量だけを編集できます。
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending ? "保存しています…" : "変更を保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

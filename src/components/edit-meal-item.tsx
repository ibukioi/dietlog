"use client";

import { Camera, ChefHat, Expand, ImageUp, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
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
import { deleteMealPhoto, shrinkImage, uploadMealPhoto } from "@/lib/image";
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
  /** 料理の写真(なければ null) */
  photoUrl: string | null;
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

/**
 * 記録した食事の編集(写真・名前・日付・食事区分・量。手入力の記録は栄養値も)。
 * 一覧の写真とペンのどちらからでも開けるよう、開く関数とダイアログを返す
 */
export function useMealItemEditor(item: EditableItem, today: string) {
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

  function openEditor() {
    setName(item.name);
    setDate(item.date);
    setMealType(item.mealType);
    setQuantity(String(item.quantity));
    setCore(Object.fromEntries(CORE_FIELDS.map((f) => [f.code, str(item[f.key])])));
    setOpen(true);
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

  const dialog = (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>記録を編集</DialogTitle>
          <DialogDescription>量を変えると、栄養値も同じ割合で増減します。</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <PhotoEditor itemId={item.id} name={item.name} initialUrl={item.photoUrl} />

          <Field label="名前" htmlFor={`edit-name-${item.id}`}>
            <Input id={`edit-name-${item.id}`} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
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
  );

  return { open: openEditor, dialog };
}

/** 写真の表示・追加・差し替え・削除。選んだ時点で保存する */
function PhotoEditor({ itemId, name, initialUrl }: { itemId: string; name: string; initialUrl: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(initialUrl);
  const [busy, start] = useTransition();

  function pick(file: File | undefined) {
    if (!file) return;
    start(async () => {
      try {
        setUrl(await uploadMealPhoto(itemId, await shrinkImage(file)));
        toast.success("写真を保存しました");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "写真を保存できませんでした");
      } finally {
        if (input.current) input.current.value = "";
      }
    });
  }

  function remove() {
    if (!confirm("この写真を削除しますか?")) return;
    start(async () => {
      try {
        await deleteMealPhoto(itemId);
        setUrl(null);
        toast.success("写真を削除しました");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "写真を削除できませんでした");
      }
    });
  }

  const fileInput = (
    <input
      ref={input}
      id={`edit-photo-${itemId}`}
      type="file"
      accept="image/*"
      className="sr-only"
      onChange={(e) => pick(e.target.files?.[0])}
    />
  );

  if (!url) {
    return (
      <div>
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="flex h-28 w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-input bg-[var(--brand-soft)]/40 text-sm text-muted-foreground hover:border-[var(--brand)] hover:text-[var(--brand)]"
        >
          <Camera className="size-5" aria-hidden />
          {busy ? "保存しています…" : "写真を追加(任意)"}
        </button>
        {fileInput}
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="group relative block overflow-hidden rounded-xl border border-border"
        aria-label={`${name}の写真を大きく表示`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- 本人だけが取得できる API の画像なので next/image の最適化は使わない */}
        <img src={url} alt={`${name}の写真`} className="aspect-[4/3] w-full object-cover" />
        <span className="absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-xs text-white">
          <Expand className="size-3" aria-hidden /> 拡大
        </span>
      </a>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
          <ImageUp aria-hidden /> {busy ? "保存しています…" : "写真を変更"}
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={remove}>
          <Trash2 aria-hidden /> 写真を削除
        </Button>
      </div>
      {fileInput}
    </div>
  );
}

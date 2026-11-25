"use client";

import { Camera, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { shrinkImage } from "@/lib/image";

/** 記録する前に選ぶ料理の写真(任意)。縮小した画像を親に渡す */
export function MealPhotoField({ value, onChange }: { value: Blob | null; onChange: (photo: Blob | null) => void }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  // 選んだ画像の一時 URL。差し替え・外したときに解放する
  const preview = useMemo(() => (value ? URL.createObjectURL(value) : null), [value]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await shrinkImage(file));
    } catch {
      toast.error("この画像は読み込めませんでした。JPEG・PNG の写真を選んでください");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        写真(任意)
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          aria-label={value ? "写真を選び直す" : "写真を追加"}
          className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-input bg-white text-muted-foreground hover:border-[var(--brand)] hover:text-[var(--brand)]"
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- ブラウザ内の一時 URL なので next/image は使えない
            <img src={preview} alt="選んだ写真" className="size-full object-cover" />
          ) : (
            <Camera className="size-4" aria-hidden />
          )}
        </button>
        {value ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            <X aria-hidden /> 外す
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">{busy ? "読み込んでいます…" : "記録と一緒に保存"}</span>
        )}
        <input
          ref={input}
          id={id}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </div>
    </div>
  );
}

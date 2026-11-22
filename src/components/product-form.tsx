"use client";

import { ImagePlus } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";

import { Field, NativeSelect, parseNum } from "@/components/form-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { nutrientDef } from "@/domain/nutrients/catalog";
import type { NutrientMap } from "@/domain/nutrients/types";

export const LABEL_FIELDS = ["ENERC_KCAL", "PROT-", "FAT-", "CHOCDF-", "NACL_EQ", "FIB-", "CA", "FE", "VITC"] as const;

export interface ProductDraft {
  id?: string;
  source: "off" | "manual" | "label_photo";
  externalRef: string | null;
  name: string;
  brand: string | null;
  basis: "per_100g" | "per_serving";
  servingSizeG: number | null;
  servingLabel: string | null;
  nutrients: NutrientMap;
  imageBlobUrl?: string | null;
}

export const emptyDraft = (): ProductDraft => ({
  source: "manual",
  externalRef: null,
  name: "",
  brand: null,
  basis: "per_serving",
  servingSizeG: null,
  servingLabel: "1食",
  nutrients: {},
  imageBlobUrl: null,
});

/** 画像をクライアント側で長辺 1024px の JPEG に縮小(§11.1 画像サイズ上限 1MB) */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("画像を変換できませんでした"))), "image/jpeg", 0.82),
  );
}

export function ProductForm({
  initial,
  submitLabel,
  uploadsEnabled,
  onSubmit,
  extra,
}: {
  initial: ProductDraft;
  submitLabel: string;
  uploadsEnabled: boolean;
  onSubmit: (draft: ProductDraft) => Promise<void>;
  extra?: React.ReactNode;
}) {
  const id = useId();
  const [d, setD] = useState<ProductDraft>(initial);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(LABEL_FIELDS.map((c) => [c, initial.nutrients[c] == null ? "" : String(initial.nutrients[c])])),
  );
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setUploading(true);
    try {
      const blob = await shrink(file);
      if (blob.size > 1_000_000) throw new Error("画像が大きすぎます(1MB まで)");
      const fd = new FormData();
      fd.set("file", blob, "label.jpg");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "アップロードできませんでした");
      setD((x) => ({ ...x, imageBlobUrl: json.url }));
      toast.success("写真を保存しました");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "アップロードできませんでした");
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!d.name.trim()) {
      toast.error("商品名を入力してください");
      return;
    }
    if (parseNum(values.ENERC_KCAL) === null) {
      toast.error("エネルギー(kcal)を入力してください");
      return;
    }
    if (d.basis === "per_serving" && !d.servingLabel) {
      toast.error("1食の単位(例: 1個)を入力してください");
      return;
    }
    const nutrients: NutrientMap = { ...d.nutrients };
    for (const c of LABEL_FIELDS) nutrients[c] = parseNum(values[c]);
    setBusy(true);
    try {
      await onSubmit({ ...d, nutrients });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="商品名・料理名" htmlFor={`${id}-name`}>
          <Input
            id={`${id}-name`}
            value={d.name}
            maxLength={80}
            onChange={(e) => setD({ ...d, name: e.target.value })}
            required
          />
        </Field>
        <Field label="メーカー・店名(任意)" htmlFor={`${id}-brand`}>
          <Input
            id={`${id}-brand`}
            value={d.brand ?? ""}
            maxLength={60}
            onChange={(e) => setD({ ...d, brand: e.target.value || null })}
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="表示の基準" htmlFor={`${id}-basis`}>
          <NativeSelect
            id={`${id}-basis`}
            value={d.basis}
            onChange={(e) => setD({ ...d, basis: e.target.value as ProductDraft["basis"] })}
          >
            <option value="per_serving">1食(1個・1袋)あたり</option>
            <option value="per_100g">100 g(100 mL)あたり</option>
          </NativeSelect>
        </Field>
        <Field label="1食の単位" htmlFor={`${id}-sl`}>
          <Input
            id={`${id}-sl`}
            value={d.servingLabel ?? ""}
            maxLength={20}
            placeholder="1個"
            onChange={(e) => setD({ ...d, servingLabel: e.target.value || null })}
          />
        </Field>
        <Field label="1食の重さ(g・任意)" htmlFor={`${id}-sg`}>
          <Input
            id={`${id}-sg`}
            inputMode="decimal"
            value={d.servingSizeG ?? ""}
            onChange={(e) => setD({ ...d, servingSizeG: parseNum(e.target.value) })}
          />
        </Field>
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">
          栄養成分表示({d.basis === "per_100g" ? "100 g あたり" : "1食あたり"})
        </legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {LABEL_FIELDS.map((c) => {
            const def = nutrientDef(c);
            return (
              <Field key={c} label={`${def.shortJa ?? def.nameJa}(${def.unit})`} htmlFor={`${id}-${c}`}>
                <Input
                  id={`${id}-${c}`}
                  inputMode="decimal"
                  value={values[c]}
                  placeholder={c === "ENERC_KCAL" ? "必須" : "記載なし"}
                  onChange={(e) => setValues({ ...values, [c]: e.target.value })}
                />
              </Field>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          記載のない成分は空欄のままにしてください。0 と区別して「データなし」として扱います。
        </p>
      </fieldset>

      {uploadsEnabled && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
          <Button type="button" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
            <ImagePlus /> {uploading ? "アップロード中…" : d.imageBlobUrl ? "写真を変更" : "パッケージの写真を添付"}
          </Button>
          {d.imageBlobUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={d.imageBlobUrl}
              alt="添付したパッケージの写真"
              className="h-16 w-16 rounded border object-cover"
            />
          )}
          <p className="text-xs text-muted-foreground">写真は参照用です(自動読み取りはしません)</p>
        </div>
      )}

      {extra}

      <div>
        <Button type="submit" disabled={busy} size="lg">
          {busy ? "保存しています…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

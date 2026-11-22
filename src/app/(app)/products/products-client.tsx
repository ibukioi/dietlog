"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ProductForm, type ProductDraft } from "@/components/product-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { saveProductAction } from "../log/actions";

import { deleteProductAction } from "./actions";
import { EmptyIllustration } from "@/components/food-illustrations";

type P = Omit<ProductDraft, "source"> & { id: string; useCount: number; source: ProductDraft["source"] | "mext" };

const SOURCE_LABEL: Record<string, string> = {
  off: "Open Food Facts",
  manual: "手入力",
  label_photo: "写真+手入力",
  mext: "八訂成分表",
};

export function ProductsClient({ products, uploadsEnabled }: { products: P[]; uploadsEnabled: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const shown = products.filter((p) => !q || `${p.name}${p.brand ?? ""}`.includes(q));

  return (
    <div className="grid gap-3">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="商品名で絞り込む"
        aria-label="商品名で絞り込む"
        className="max-w-sm"
      />
      {products.length === 0 && (
        <div className="flex items-center gap-5 rounded-2xl border border-dashed border-border bg-white p-6 text-sm text-muted-foreground">
          <EmptyIllustration />
          <p>まだ商品がありません。記録画面の「市販品」「手入力」から追加できます。</p>
        </div>
      )}
      <ul className="grid gap-3">
        {shown.map((p) => (
          <li key={p.id} className="rounded-lg border border-border bg-white p-4">
            {editing === p.id && p.source !== "mext" ? (
              <ProductForm
                initial={{ ...p, source: p.source as ProductDraft["source"] }}
                uploadsEnabled={uploadsEnabled}
                submitLabel="変更を保存"
                extra={
                  <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                    キャンセル
                  </Button>
                }
                onSubmit={async (d) => {
                  await saveProductAction({ ...d, id: p.id, source: p.source as ProductDraft["source"] });
                  toast.success("変更を保存しました");
                  setEditing(null);
                  router.refresh();
                }}
              />
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  {p.imageBlobUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageBlobUrl} alt="" className="h-14 w-14 shrink-0 rounded border object-cover" />
                  )}
                  <div className="min-w-0">
                    <p className="font-medium">{p.brand ? `${p.name}(${p.brand})` : p.name}</p>
                    <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span>
                        {p.nutrients.ENERC_KCAL ?? "—"} kcal /{" "}
                        {p.basis === "per_100g" ? "100 g" : (p.servingLabel ?? "1食")}
                      </span>
                      <Badge variant="outline" className="h-5 text-[10px] font-normal">
                        {SOURCE_LABEL[p.source] ?? p.source}
                      </Badge>
                      <span>記録 {p.useCount} 回</span>
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {p.source !== "mext" && (
                    <Button size="sm" variant="outline" onClick={() => setEditing(p.id)}>
                      編集
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => {
                      if (!confirm(`「${p.name}」を自分の商品から削除しますか?(記録済みの食事は残ります)`)) return;
                      start(async () => {
                        await deleteProductAction(p.id);
                        toast.success(`「${p.name}」を削除しました`);
                        router.refresh();
                      });
                    }}
                  >
                    削除
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

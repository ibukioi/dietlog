"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Field, parseNum } from "@/components/form-bits";
import { ProductForm, type ProductDraft } from "@/components/product-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSearchMatcher } from "@/components/use-search-matcher";
import type { OffCandidate } from "@/server/off/normalize";

import { saveAndLogProduct } from "./actions";
import type { ProductSummary, Where } from "./log-client";
import { QuickProductList } from "./quick-product-list";

type OffState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; products: OffCandidate[]; source: "cache" | "live" }
  | { kind: "error"; message: string };

export function ProductTab({
  where,
  products,
  uploadsEnabled,
  onLogged,
  goTab,
}: {
  where: Where;
  products: ProductSummary[];
  uploadsEnabled: boolean;
  onLogged: (itemId?: string) => void;
  goTab: (t: string) => void;
}) {
  const [q, setQ] = useState("");
  const [off, setOff] = useState<OffState>({ kind: "idle" });
  const [picked, setPicked] = useState<OffCandidate | null>(null);
  const [grams, setGrams] = useState("100");

  // 入力中は自分の商品だけをリアルタイムに絞り込む(外部 API は呼ばない)
  const matches = useSearchMatcher(q);
  const mine = useMemo(() => {
    if (!q.trim()) return [];
    return products.filter((p) => matches(`${p.name} ${p.brand ?? ""}`, p.reading)).slice(0, 8);
  }, [q, products, matches]);

  async function searchOff(e?: React.FormEvent) {
    e?.preventDefault();
    if (!q.trim()) return;
    setPicked(null);
    setOff({ kind: "loading" });
    try {
      const res = await fetch(`/api/off/search?q=${encodeURIComponent(q.trim())}`);
      const json = await res.json();
      if (json.status === "ok") setOff({ kind: "ok", products: json.products, source: json.source });
      else setOff({ kind: "error", message: json.message ?? "検索できませんでした" });
    } catch {
      setOff({ kind: "error", message: "Open Food Facts に接続できません。手入力で記録できます。" });
    }
  }

  if (picked) {
    const draft: ProductDraft = {
      source: "off",
      externalRef: picked.code,
      name: picked.name,
      brand: picked.brand,
      basis: "per_100g",
      servingSizeG: null,
      servingLabel: picked.servingSize ?? null,
      nutrients: picked.per100g,
    };
    return (
      <div className="grid gap-4 rounded-lg border border-border bg-white p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-bold">内容を確認して記録</h2>
            <p className="text-sm text-muted-foreground">
              Open Food Facts
              の登録内容です。パッケージの表示と違うところや空欄は、ここで直せます(自分の商品として保存されます)。
            </p>
          </div>
          <Button variant="ghost" onClick={() => setPicked(null)}>
            検索結果に戻る
          </Button>
        </div>
        {picked.warnings.length > 0 && (
          <ul className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {picked.warnings.map((w) => (
              <li key={w}>要確認: {w}</li>
            ))}
          </ul>
        )}
        <ProductForm
          key={picked.code}
          initial={draft}
          uploadsEnabled={uploadsEnabled}
          submitLabel="保存して記録する"
          extra={
            <Field label="食べた量(g)" htmlFor="off-grams" hint="100 g あたりの値から計算します" className="max-w-40">
              <Input id="off-grams" inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} />
            </Field>
          }
          onSubmit={async (d) => {
            const g = parseNum(grams);
            if (!g || g <= 0) {
              toast.error("食べた量を入力してください");
              return;
            }
            const r = await saveAndLogProduct({
              ...where,
              product: { ...d, nutrients: d.nutrients },
              amount: d.basis === "per_100g" ? { grams: g } : { servings: 1 },
            });
            toast.success(`${d.name}を記録しました`);
            onLogged(r.itemId);
          }}
        />
        <p className="text-xs text-muted-foreground">
          商品データ: Open Food Facts(openfoodfacts.org)、Open Database License に基づき利用
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <form onSubmit={searchOff} className="flex gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="商品名・メーカー名(例: サラダチキン、おにぎり)"
          aria-label="商品名で検索"
        />
        <Button type="submit" disabled={!q.trim() || off.kind === "loading"}>
          <Search /> 検索
        </Button>
      </form>

      {mine.length > 0 && (
        <section className="grid gap-1">
          <h2 className="text-sm font-bold">自分の商品</h2>
          <QuickProductList products={mine} where={where} onLogged={onLogged} />
        </section>
      )}

      <section className="grid gap-2" aria-live="polite">
        {off.kind === "idle" && (
          <p className="text-sm text-muted-foreground">
            「検索」を押すと Open Food Facts の日本の商品から探します。見つからないときは
            <button type="button" className="mx-1 underline" onClick={() => goTab("manual")}>
              手入力
            </button>
            か、ブランドのない料理なら
            <button type="button" className="mx-1 underline" onClick={() => goTab("dish")}>
              料理・惣菜
            </button>
            で探せます。
          </p>
        )}
        {off.kind === "loading" && <p className="text-sm text-muted-foreground">Open Food Facts を検索しています…</p>}
        {off.kind === "error" && (
          <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {off.message}
            <button type="button" className="ml-2 underline" onClick={() => goTab("manual")}>
              手入力で記録する
            </button>
          </div>
        )}
        {off.kind === "ok" && off.products.length === 0 && (
          <p className="text-sm text-muted-foreground">
            見つかりませんでした。
            <button type="button" className="mx-1 underline" onClick={() => goTab("manual")}>
              手入力で記録する
            </button>
            か、
            <button type="button" className="mx-1 underline" onClick={() => goTab("dish")}>
              料理・惣菜で探す
            </button>
          </p>
        )}
        {off.kind === "ok" && off.products.length > 0 && (
          <>
            <h2 className="text-sm font-bold">
              Open Food Facts の検索結果 {off.products.length} 件
              {off.source === "cache" && (
                <span className="ml-2 font-normal text-muted-foreground">(保存済みの結果)</span>
              )}
            </h2>
            <ul className="divide-y divide-border rounded-lg border border-border bg-white">
              {off.products.map((p) => (
                <li key={p.code}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-muted"
                    onClick={() => setPicked(p)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{p.name}</span>
                      <span className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                        {p.brand && <span>{p.brand}</span>}
                        {p.quantity && <span>{p.quantity}</span>}
                        {p.missingCore > 0 && (
                          <Badge variant="outline" className="h-5 text-[10px]">
                            一部の成分なし
                          </Badge>
                        )}
                        {p.warnings.length > 0 && (
                          <Badge variant="outline" className="h-5 text-[10px]">
                            要確認
                          </Badge>
                        )}
                      </span>
                    </span>
                    <span className="shrink-0 font-num text-sm tabular-nums">
                      {p.per100g.ENERC_KCAL ?? "—"} kcal
                      <span className="block text-right text-[10px] text-muted-foreground">/100 g</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              商品データ: Open Food Facts(openfoodfacts.org)、Open Database License
              に基づき利用。登録内容は利用者の投稿によるもので、誤りを含むことがあります。
            </p>
          </>
        )}
      </section>
    </div>
  );
}

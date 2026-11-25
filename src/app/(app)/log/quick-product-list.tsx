"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { logMyProduct } from "./actions";
import type { ProductSummary, Where } from "./log-client";

/** 自分の商品を 1 食(または 100 g)分ですぐ記録する簡易リスト */
export function QuickProductList({
  products,
  where,
  onLogged,
}: {
  products: ProductSummary[];
  where: Where;
  onLogged: (itemId?: string) => void;
}) {
  const [pending, start] = useTransition();
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-white px-4">
      {products.map((p) => (
        <li key={p.id} className="flex items-center justify-between gap-3 py-2">
          <span className="min-w-0 truncate">{p.brand ? `${p.name}(${p.brand})` : p.name}</span>
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await logMyProduct({
                  ...where,
                  productId: p.id,
                  amount: p.basis === "per_serving" ? { servings: 1 } : { grams: p.servingSizeG ?? 100 },
                });
                toast.success(`${p.name}を記録しました`);
                onLogged(r.itemId);
              })
            }
          >
            {p.basis === "per_serving" ? `${p.servingLabel ?? "1食"}記録` : `${p.servingSizeG ?? 100} g 記録`}
          </Button>
        </li>
      ))}
    </ul>
  );
}

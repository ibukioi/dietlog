"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Field, parseNum } from "@/components/form-bits";
import { ProductForm, emptyDraft } from "@/components/product-form";
import { Input } from "@/components/ui/input";

import { saveAndLogProduct } from "./actions";
import type { Where } from "./log-client";

export function ManualTab({
  where,
  uploadsEnabled,
  onLogged,
}: {
  where: Where;
  uploadsEnabled: boolean;
  onLogged: () => void;
}) {
  const [amount, setAmount] = useState("1");
  return (
    <div className="grid gap-3 rounded-lg border border-border bg-white p-4">
      <p className="text-sm text-muted-foreground">
        パッケージやお店のメニューに書かれた栄養成分表示を入力します。保存した商品は次回から「よく使う」に出てきます。
      </p>
      <ProductForm
        initial={emptyDraft()}
        uploadsEnabled={uploadsEnabled}
        submitLabel="保存して記録する"
        extra={
          <Field
            label="食べた量(1食の表示なら個数、100 g の表示ならグラム)"
            htmlFor="manual-amount"
            className="max-w-80"
          >
            <Input
              id="manual-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-32"
            />
          </Field>
        }
        onSubmit={async (d) => {
          const a = parseNum(amount);
          if (!a || a <= 0) {
            toast.error("食べた量を入力してください");
            return;
          }
          await saveAndLogProduct({
            ...where,
            product: d,
            amount: d.basis === "per_serving" ? { servings: a } : { grams: a },
          });
          toast.success(`${d.name}を記録しました`);
          onLogged();
        }}
      />
    </div>
  );
}

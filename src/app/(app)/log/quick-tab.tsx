"use client";

import { Minus, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { logMyProduct, logRecipe } from "./actions";
import type { ProductSummary, RecipeSummary, Where } from "./log-client";

function Stepper({
  value,
  onChange,
  step,
  min,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  step: number;
  min: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label="減らす"
        onClick={() => onChange(Math.max(min, +(value - step).toFixed(2)))}
      >
        <Minus />
      </Button>
      <span className="w-12 text-center font-num tabular-nums">{value}</span>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label="増やす"
        onClick={() => onChange(+(value + step).toFixed(2))}
      >
        <Plus />
      </Button>
    </div>
  );
}

function RecipeRow({ r, where, onLogged }: { r: RecipeSummary; where: Where; onLogged: () => void }) {
  const [servings, setServings] = useState(1);
  const [pending, start] = useTransition();
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="font-medium">{r.name}</p>
        <p className="text-xs text-muted-foreground">
          {r.servings}人前のレシピ・食材 {r.ingredientCount} 品
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Stepper value={servings} onChange={setServings} step={0.5} min={0.5} label={`${r.name}の人前`} />
        <span className="text-sm text-muted-foreground">人前</span>
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              await logRecipe({ ...where, recipeId: r.id, eatenServings: servings });
              toast.success(`${r.name}を記録しました`);
              onLogged();
            })
          }
        >
          記録
        </Button>
      </div>
    </li>
  );
}

function ProductRow({ p, where, onLogged }: { p: ProductSummary; where: Where; onLogged: () => void }) {
  const perServing = p.basis === "per_serving";
  const [amount, setAmount] = useState(perServing ? 1 : (p.servingSizeG ?? 100));
  const [pending, start] = useTransition();
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="font-medium">{p.brand ? `${p.name}(${p.brand})` : p.name}</p>
        <p className="text-xs text-muted-foreground">
          {p.kcal !== null ? `${p.kcal} kcal / ${perServing ? (p.servingLabel ?? "1食") : "100 g"}` : "エネルギー不明"}
          {p.source === "off" && "・Open Food Facts"}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Stepper
          value={amount}
          onChange={setAmount}
          step={perServing ? 0.5 : 10}
          min={perServing ? 0.5 : 10}
          label={`${p.name}の量`}
        />
        <span className="text-sm text-muted-foreground">
          {perServing ? (p.servingLabel?.replace(/^1/, "") ?? "食") : "g"}
        </span>
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              await logMyProduct({
                ...where,
                productId: p.id,
                amount: perServing ? { servings: amount } : { grams: amount },
              });
              toast.success(`${p.name}を記録しました`);
              onLogged();
            })
          }
        >
          記録
        </Button>
      </div>
    </li>
  );
}

export function QuickTab({
  where,
  products,
  recipes,
  onLogged,
  goTab,
}: {
  where: Where;
  products: ProductSummary[];
  recipes: RecipeSummary[];
  onLogged: () => void;
  goTab: (t: string) => void;
}) {
  return (
    <div className="grid gap-6">
      <section className="grid gap-1">
        <h2 className="font-bold">自炊のタグ</h2>
        {recipes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            自炊で作った料理を「タグとして保存」すると、ここからワンタップで記録できます。
            <button type="button" className="ml-1 underline" onClick={() => goTab("cook")}>
              自炊を記録する
            </button>
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-white px-4">
            {recipes.map((r) => (
              <RecipeRow key={r.id} r={r} where={where} onLogged={onLogged} />
            ))}
          </ul>
        )}
      </section>
      <section className="grid gap-1">
        <h2 className="font-bold">自分の商品</h2>
        {products.length === 0 ? (
          <p className="text-sm text-muted-foreground">市販品を検索したり手入力したりすると、ここに保存されます。</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-white px-4">
            {products.slice(0, 12).map((p) => (
              <ProductRow key={p.id} p={p} where={where} onLogged={onLogged} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

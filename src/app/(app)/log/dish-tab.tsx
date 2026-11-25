"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { type FoodHit, FoodSearch } from "@/components/food-search";
import { Field, parseNum } from "@/components/form-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { logMextDish } from "./actions";
import type { Where } from "./log-client";

const PRESETS = [100, 150, 200, 250, 300];

export function DishTab({
  where,
  onLogged,
  goTab,
}: {
  where: Where;
  onLogged: (itemId?: string) => void;
  goTab: (t: string) => void;
}) {
  const [picked, setPicked] = useState<FoodHit | null>(null);
  const [grams, setGrams] = useState("200");
  const [pending, start] = useTransition();
  const g = parseNum(grams);
  const kcal = picked?.energyKcal != null && g ? Math.round((picked.energyKcal * g) / 100) : null;

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        ブランドのない料理・惣菜は、日本食品標準成分表(八訂)の値を
        <strong className="font-medium text-foreground">目安値</strong>
        として記録します。お店や家庭のレシピとは異なる場合があります。
      </p>
      <FoodSearch
        mode="dish"
        label="料理名で検索"
        placeholder="料理名(例: 肉じゃが、ぎょうざ、から揚げ、カレー)"
        onPick={(h) => {
          setPicked(h);
          setGrams("200");
        }}
      />
      {picked && (
        <div className="grid gap-3 rounded-lg border border-border bg-white p-4">
          <div>
            <p className="font-bold">{picked.nameDisplay}</p>
            <p className="text-xs text-muted-foreground">
              目安値・出典: 八訂成分表(可食部 100 g あたり {picked.energyKcal ?? "—"} kcal)
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="食べた量(g)" htmlFor="dish-g" className="w-32">
              <Input id="dish-g" inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} />
            </Field>
            <div className="flex flex-wrap gap-1">
              {PRESETS.map((p) => (
                <Button
                  key={p}
                  type="button"
                  size="sm"
                  variant={g === p ? "secondary" : "outline"}
                  onClick={() => setGrams(String(p))}
                >
                  {p} g
                </Button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="font-num text-lg tabular-nums">{kcal ?? "—"} kcal</span>
            <Button
              disabled={pending || !g || g <= 0}
              onClick={() =>
                start(async () => {
                  const r = await logMextDish({ ...where, foodNo: picked.foodNo, grams: g! });
                  toast.success(`${picked.nameDisplay}を記録しました`);
                  onLogged(r.itemId);
                })
              }
            >
              記録する
            </Button>
          </div>
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        見つからないときは、
        <button type="button" className="mx-1 underline" onClick={() => goTab("cook")}>
          材料から自炊として記録
        </button>
        するか、
        <button type="button" className="mx-1 underline" onClick={() => goTab("manual")}>
          手入力
        </button>
        できます。
      </p>
    </div>
  );
}

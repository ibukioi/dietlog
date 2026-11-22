"use client";

import { useEffect, useState } from "react";

import { useDebounced } from "@/components/form-bits";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export interface FoodHit {
  foodNo: string;
  nameDisplay: string;
  groupCode: string;
  isCooked: boolean;
  isDish: boolean;
  energyKcal: number | null;
}

/** 成分表の食品を入力中にリアルタイム検索する(DB 内のみ) */
export function FoodSearch({
  mode,
  placeholder,
  onPick,
  autoFocus,
  label,
}: {
  mode: "ingredient" | "dish" | "seasoning";
  placeholder: string;
  onPick: (hit: FoodHit) => void;
  autoFocus?: boolean;
  label: string;
}) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 180);
  // 結果は検索語と組で持ち、現在の検索語の結果だけを表示する(effect 内で同期的に setState しない)
  const [result, setResult] = useState<{ q: string; hits: FoodHit[] }>({ q: "", hits: [] });
  const term = dq.trim();
  const hits = term && result.q === term ? result.hits : [];
  const loading = Boolean(term) && result.q !== term;

  useEffect(() => {
    if (!term) return;
    const ctrl = new AbortController();
    fetch(`/api/foods/search?mode=${mode}&q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((j) => setResult({ q: term, hits: j.hits ?? [] }))
      .catch(() => {});
    return () => ctrl.abort();
  }, [term, mode]);

  return (
    <div className="grid gap-2">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        autoFocus={autoFocus}
      />
      <div aria-live="polite" className="sr-only">
        {dq && !loading ? `${hits.length} 件` : ""}
      </div>
      {dq && !loading && hits.length === 0 && (
        <p className="text-sm text-muted-foreground">
          見つかりませんでした。別の言い方(例: 「鶏むね」→「にわとり むね」)でも探せます。
        </p>
      )}
      {hits.length > 0 && (
        <ul className="max-h-80 divide-y divide-border overflow-auto rounded-lg border border-border bg-white">
          {hits.map((h) => (
            <li key={h.foodNo}>
              <button
                type="button"
                onClick={() => {
                  onPick(h);
                  setQ("");
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span className="min-w-0">
                  {h.nameDisplay}
                  {h.groupCode === "18" && (
                    <Badge variant="secondary" className="ml-1.5 h-5 text-[10px] font-normal">
                      惣菜
                    </Badge>
                  )}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {h.energyKcal ?? "—"} kcal/100 g
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

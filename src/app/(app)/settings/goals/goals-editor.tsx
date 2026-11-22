"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { NativeSelect, parseNum } from "@/components/form-bits";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { Goal, GoalDirection } from "@/domain/goals/goals";
import { NUTRIENTS, nutrientDef, nutrientLabel } from "@/domain/nutrients/catalog";

import { resetGoalsAction, saveGoalsAction } from "../actions";

type Row = { nutrientCode: string; target: string; upper: string; direction: GoalDirection; showOnHome: boolean };

const SELECTABLE = NUTRIENTS.filter((n) => !["ENERC", "WATER", "ASH", "REFUSE"].includes(n.code));

export function GoalsEditor({ initial, hasProfile }: { initial: Goal[]; hasProfile: boolean }) {
  const [rows, setRows] = useState<Row[]>(
    initial.map((g) => ({
      nutrientCode: g.nutrientCode,
      target: String(g.target),
      upper: g.upper == null ? "" : String(g.upper),
      direction: g.direction,
      showOnHome: g.showOnHome,
    })),
  );
  const [adding, setAdding] = useState("");
  const [pending, start] = useTransition();
  const update = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  function save() {
    const goals: Goal[] = [];
    for (const [i, r] of rows.entries()) {
      const target = parseNum(r.target);
      const upper = parseNum(r.upper);
      if (!target || target <= 0) return toast.error(`${nutrientLabel(r.nutrientCode)}の目標を入力してください`);
      if (r.direction === "range" && (!upper || upper < target))
        return toast.error(`${nutrientLabel(r.nutrientCode)}の上限は下限以上にしてください`);
      goals.push({
        nutrientCode: r.nutrientCode,
        target,
        upper: r.direction === "range" ? upper : null,
        direction: r.direction,
        showOnHome: r.showOnHome,
        displayOrder: i,
      });
    }
    start(async () => {
      await saveGoalsAction(goals);
      toast.success("目標を保存しました");
    });
  }

  return (
    <div className="grid gap-3">
      <div className="overflow-x-auto rounded-lg border border-border bg-white">
        <table className="w-full min-w-[600px] text-sm">
          <thead className="border-b border-border text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">栄養素</th>
              <th className="px-3 py-2 font-medium">目標の種類</th>
              <th className="px-3 py-2 font-medium">目標</th>
              <th className="px-3 py-2 font-medium">上限(範囲のとき)</th>
              <th className="px-3 py-2 font-medium">ホームに表示</th>
              <th className="sr-only px-3 py-2">削除</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => {
              const unit = nutrientDef(r.nutrientCode).unit;
              const label = nutrientLabel(r.nutrientCode);
              return (
                <tr key={r.nutrientCode}>
                  <td className="px-3 py-2 font-medium">{label}</td>
                  <td className="px-3 py-2">
                    <NativeSelect
                      aria-label={`${label}の目標の種類`}
                      value={r.direction}
                      onChange={(e) => update(i, { direction: e.target.value as GoalDirection })}
                    >
                      <option value="at_least">これ以上とる</option>
                      <option value="at_most">これ以下に抑える</option>
                      <option value="range">範囲におさめる</option>
                    </NativeSelect>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <Input
                        aria-label={`${label}の目標`}
                        inputMode="decimal"
                        className="w-24"
                        value={r.target}
                        onChange={(e) => update(i, { target: e.target.value })}
                      />
                      <span className="text-xs text-muted-foreground">{unit}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {r.direction === "range" ? (
                      <div className="flex items-center gap-1">
                        <Input
                          aria-label={`${label}の上限`}
                          inputMode="decimal"
                          className="w-24"
                          value={r.upper}
                          onChange={(e) => update(i, { upper: e.target.value })}
                        />
                        <span className="text-xs text-muted-foreground">{unit}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Checkbox
                      aria-label={`${label}をホームに表示`}
                      checked={r.showOnHome}
                      onCheckedChange={(v) => update(i, { showOnHome: Boolean(v) })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`${label}の目標を削除`}
                      onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                    >
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect aria-label="目標を追加する栄養素" value={adding} onChange={(e) => setAdding(e.target.value)}>
          <option value="">栄養素を追加…</option>
          {SELECTABLE.filter((n) => !rows.some((r) => r.nutrientCode === n.code)).map((n) => (
            <option key={n.code} value={n.code}>
              {n.shortJa ?? n.nameJa}
            </option>
          ))}
        </NativeSelect>
        <Button
          variant="outline"
          disabled={!adding}
          onClick={() => {
            setRows((rs) => [
              ...rs,
              { nutrientCode: adding, target: "", upper: "", direction: "at_least", showOnHome: true },
            ]);
            setAdding("");
          }}
        >
          追加
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="lg" onClick={save} disabled={pending}>
          目標を保存
        </Button>
        {hasProfile && (
          <Button
            size="lg"
            variant="outline"
            disabled={pending}
            onClick={() => {
              if (!confirm("プロフィールから目標を計算し直しますか?(変更した目標は初期値に戻ります)")) return;
              start(async () => {
                await resetGoalsAction();
                toast.success("目標を初期値に戻しました");
                location.reload();
              });
            }}
          >
            初期値に戻す
          </Button>
        )}
      </div>
    </div>
  );
}

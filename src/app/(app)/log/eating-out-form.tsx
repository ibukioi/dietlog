"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { type FoodHit, FoodSearch } from "@/components/food-search";
import { Field, NativeSelect, parseNum, useDebounced } from "@/components/form-bits";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  DISH_TYPES,
  type DishTypeCode,
  EXTRA_SAUTE_OIL_G,
  FOOD_NO,
  PORTION_SIZE_LABEL,
  type PortionSize,
  SHARE_LABEL,
  STAPLE_PRESETS,
  type Share,
  allocateGrams,
  defaultStapleGrams,
  buildEstimateSpecs,
  dishType,
  isServedAsIs,
  isStaple,
} from "@/domain/calc/eating-out";
import type { RecipeResult } from "@/domain/calc/home-cooked";
import { COOKING_METHODS, type CookingMethodCode } from "@/domain/mext/cooking";
import { cn } from "@/lib/utils";

import { logEatingOut, previewHomeCooked } from "./actions";
import type { Where } from "./log-client";

interface Row {
  key: string;
  foodNo: string;
  name: string;
  share: Share;
  /** 重さで指定したとき(入力中の文字列)。null なら割合で按分 */
  grams: string | null;
  servedAsIs: boolean;
  staple: boolean;
}

const SIZES: PortionSize[] = ["small", "regular", "large"];
const SHARES: Share[] = ["main", "plenty", "little"];
const newKey = () => Math.random().toString(36).slice(2);

function fmt(n: number | null | undefined, d = 1) {
  return n == null ? "—" : n.toLocaleString("ja-JP", { maximumFractionDigits: d });
}

/** 選択肢を横に並べたボタン(ラジオとして読み上げる) */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-full border px-3 py-1 text-sm transition-colors",
            value === o.value
              ? "border-[var(--brand)] bg-[var(--brand)] text-white"
              : "border-input bg-white hover:border-[var(--brand)]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * 成分表にない外食を、食材と料理の大きさから推定して記録する。
 * 食材の重さは分からない前提で、料理の種類・大きさから 1 人前の重さを決め、食材の多さで按分する
 */
export function EatingOutForm({ where, onLogged }: { where: Where; onLogged: (itemId?: string) => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<DishTypeCode>("teishoku");
  const [size, setSize] = useState<PortionSize>("regular");
  const [method, setMethod] = useState<CookingMethodCode>("saute");
  const [rows, setRows] = useState<Row[]>([]);
  const [addSeasoning, setAddSeasoning] = useState(true);
  const [calc, setCalc] = useState<{ key: string; result: RecipeResult | null; error: string | null }>({
    key: "",
    result: null,
    error: null,
  });
  const [pending, start] = useTransition();

  const estimateRows = useMemo(
    () =>
      rows.map((r) => ({
        foodNo: r.foodNo,
        share: r.share,
        grams: r.grams === null ? null : (parseNum(r.grams) ?? 0),
        servedAsIs: r.servedAsIs,
      })),
    [rows],
  );
  const allocated = allocateGrams({ dishType: type, size, rows: estimateRows });
  const specs = useMemo(
    () => buildEstimateSpecs({ dishType: type, size, method, rows: estimateRows, addSeasoning }),
    [type, size, method, estimateRows, addSeasoning],
  );
  const seasoning = specs.filter((s) => s.role === "seasoning");

  const debounced = useDebounced(JSON.stringify(specs), 350);
  useEffect(() => {
    const parsed = JSON.parse(debounced) as typeof specs;
    if (!parsed.some((s) => s.role === "ingredient")) return;
    let cancelled = false;
    previewHomeCooked({ ingredients: parsed, servings: 1 })
      .then((r) => !cancelled && setCalc({ key: debounced, result: r, error: null }))
      .catch(
        () =>
          !cancelled &&
          setCalc({ key: debounced, result: null, error: "計算できませんでした。食材を確認してください。" }),
      );
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const hasIngredients = specs.some((s) => s.role === "ingredient");
  const result = hasIngredients ? calc.result : null;
  const calcError = hasIngredients ? calc.error : null;
  const n = (code: string) => (result?.perServing[code] as number | null | undefined) ?? null;

  function addFood(h: FoodHit) {
    const staple = isStaple(h);
    const servedAsIs = isServedAsIs(h);
    setRows((rs) => [
      ...rs,
      {
        key: newKey(),
        foodNo: h.foodNo,
        name: h.nameDisplay,
        // 最初の食材をメイン、あとは「たっぷり」から始める。ごはん・麺は重さで指定
        share: rs.some((r) => r.grams === null) ? "plenty" : "main",
        grams: staple ? String(defaultStapleGrams(type, !/めし|ごはん|かゆ/.test(h.nameDisplay))) : null,
        servedAsIs,
        staple,
      },
    ]);
  }

  const update = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  function submit() {
    if (!name.trim()) return toast.error("料理名を入力してください");
    if (!hasIngredients) return toast.error("食材を追加してください");
    start(async () => {
      const r = await logEatingOut({
        ...where,
        name: name.trim(),
        ingredients: specs,
        estimate: { dishType: type, size, method, addSeasoning },
      });
      toast.success(`${name.trim()}を推定値として記録しました`);
      onLogged(r.itemId);
    });
  }

  const dt = dishType(type);

  return (
    <section
      aria-labelledby="eat-out-title"
      className="grid gap-6 rounded-xl border border-border bg-white/70 p-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]"
    >
      <div className="grid min-w-0 content-start gap-5">
        <div className="grid gap-1">
          <h2 id="eat-out-title" className="font-bold">
            材料から推定する
          </h2>
          <p className="text-sm text-muted-foreground">
            お店の料理は食材の重さが分からないので、料理の種類と大きさから 1
            人前の重さを見積もり、食材の多さで分けて計算します。 結果は
            <strong className="font-medium text-foreground">推定値</strong>(誤差 ±20〜30% 程度)です。
          </p>
        </div>

        <Field label="料理名" htmlFor="eat-out-name">
          <Input
            id="eat-out-name"
            value={name}
            maxLength={60}
            placeholder="例: 豚キムチ炒め定食のおかず"
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <div className="grid gap-2">
          <p className="text-sm font-medium">料理の種類</p>
          <Segmented
            label="料理の種類"
            value={type}
            options={DISH_TYPES.map((d) => ({ value: d.code, label: d.label }))}
            onChange={setType}
          />
          <p className="text-xs text-muted-foreground">{dt.hint}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid content-start gap-2">
            <p className="text-sm font-medium">大きさ</p>
            <Segmented
              label="大きさ"
              value={size}
              options={SIZES.map((s) => ({ value: s, label: PORTION_SIZE_LABEL[s] }))}
              onChange={setSize}
            />
            <p className="text-xs text-muted-foreground">ごはん・麺を除いた部分 約 {dt.grams[size]} g</p>
          </div>
          <Field label="調理法(料理全体)" htmlFor="eat-out-method">
            <NativeSelect
              id="eat-out-method"
              value={method}
              onChange={(e) => setMethod(e.target.value as CookingMethodCode)}
            >
              {COOKING_METHODS.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.nameJa}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>

        <div className="grid gap-2">
          <p className="text-sm font-medium">食材</p>
          <p className="text-xs text-muted-foreground">
            見えている食材を追加して、多さを選んでください。ごはん・麺は重さで指定します。調味料は下の「外食の味付け」でまとめて足します。
          </p>
          {rows.map((r, i) => (
            <div key={r.key} className="grid gap-2 rounded-lg border border-border bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 text-sm font-medium break-words">{r.name}</p>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${r.name}を外す`}
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                >
                  <Trash2 />
                </Button>
              </div>
              {r.grams === null ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Segmented
                    label={`${r.name}の多さ`}
                    value={r.share}
                    options={SHARES.map((s) => ({ value: s, label: SHARE_LABEL[s] }))}
                    onChange={(share) => update(r.key, { share })}
                  />
                  <span className="text-xs text-muted-foreground tabular-nums">約 {fmt(allocated[i], 0)} g</span>
                  <button
                    type="button"
                    className="text-xs underline"
                    onClick={() => update(r.key, { grams: String(Math.round(allocated[i])) })}
                  >
                    重さで指定
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-end gap-2">
                  <Field label="盛り付けた重さ(g)" htmlFor={`${r.key}-g`} className="w-36">
                    <Input
                      id={`${r.key}-g`}
                      inputMode="decimal"
                      value={r.grams}
                      onChange={(e) => update(r.key, { grams: e.target.value })}
                    />
                  </Field>
                  {r.staple && (
                    <div className="flex flex-wrap gap-1" role="group" aria-label={`${r.name}の量の目安`}>
                      {STAPLE_PRESETS.map((p) => (
                        <Button
                          key={p.label}
                          type="button"
                          size="sm"
                          variant={parseNum(r.grams ?? "") === p.grams ? "secondary" : "outline"}
                          onClick={() => update(r.key, { grams: String(p.grams) })}
                        >
                          {p.label}
                        </Button>
                      ))}
                    </div>
                  )}
                  {!r.staple && (
                    <button
                      type="button"
                      className="mb-2 text-xs underline"
                      onClick={() => update(r.key, { grams: null })}
                    >
                      多さで指定に戻す
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
          <FoodSearch
            mode="ingredient"
            label="外食の食材を追加"
            placeholder="食材を追加(例: ぶた肉、キャベツ、ごはん、中華めん)"
            onPick={addFood}
          />
        </div>

        <label className="flex items-start gap-2 text-sm">
          <Checkbox className="mt-0.5" checked={addSeasoning} onCheckedChange={(v) => setAddSeasoning(Boolean(v))} />
          <span>
            外食の味付けを足す
            <span className="block text-xs text-muted-foreground">
              {seasoning.length > 0
                ? seasoning.map((s) => (s.foodNo === FOOD_NO.salt ? `塩 ${s.amount} g` : `油 ${s.amount} g`)).join("・")
                : `料理の種類ごとの塩${method === "saute" ? `と、炒め物の油(普通盛り ${EXTRA_SAUTE_OIL_G} g)` : ""}`}
              を加えます(本アプリの推計値)。食材だけでは入らない、お店の味付けの分です。
            </span>
          </span>
        </label>
      </div>

      <aside className="grid content-start gap-4 lg:sticky lg:top-20">
        <div className="status-window grid gap-3 p-4" aria-live="polite">
          <h3 className="text-sm font-medium text-[var(--brand-deep)]">推定結果(1 人前)</h3>
          {!result ? (
            <p className="text-sm text-muted-foreground">{calcError ?? "食材を追加すると、ここに推定値が出ます。"}</p>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted-foreground">エネルギー</dt>
                <dd className="text-right font-num text-xl tabular-nums">{fmt(n("ENERC_KCAL"), 0)} kcal</dd>
                <dt className="text-muted-foreground">たんぱく質</dt>
                <dd className="text-right tabular-nums">{fmt(n("PROT-"))} g</dd>
                <dt className="text-muted-foreground">脂質</dt>
                <dd className="text-right tabular-nums">{fmt(n("FAT-"))} g</dd>
                <dt className="text-muted-foreground">炭水化物</dt>
                <dd className="text-right tabular-nums">{fmt(n("CHOCDF-"))} g</dd>
                <dt className="text-muted-foreground">食塩相当量</dt>
                <dd className="text-right tabular-nums">{fmt(n("NACL_EQ"))} g</dd>
              </dl>
              <p className="text-xs text-muted-foreground">
                推定値。実際の量によって ±20〜30% 程度ずれることがあります。
              </p>
            </>
          )}
        </div>

        {result && (
          <details className="rounded-lg border border-border bg-white p-4 text-sm">
            <summary className="cursor-pointer font-bold">計算の内訳</summary>
            <ul className="mt-3 grid gap-2">
              {result.lines.map((l, i) => (
                <li key={i} className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0">
                    {l.name}
                    <span className="ml-1 text-xs text-muted-foreground">
                      {l.role === "seasoning"
                        ? `外食の味付け ${fmt(l.inputGrams)} g`
                        : `盛り付け 約 ${fmt(l.inputGrams, 0)} g`}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums">{fmt(l.nutrients.ENERC_KCAL as number, 0)} kcal</span>
                </li>
              ))}
              {result.oil.map((o, i) => (
                <li key={`oil-${i}`} className="flex items-baseline justify-between gap-2">
                  <span>
                    {o.name}
                    <span className="ml-1 text-xs text-muted-foreground">(吸油量の推定 {fmt(o.absorbedG)} g)</span>
                  </span>
                  <span className="shrink-0 tabular-nums">{fmt(o.nutrients.ENERC_KCAL as number, 0)} kcal</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              料理の大きさ・味付けの量は本アプリの推計値。食品の成分値は日本食品標準成分表(八訂)増補2023年。
            </p>
          </details>
        )}

        <Button size="lg" disabled={pending || !result} onClick={submit}>
          {pending ? "保存しています…" : "推定値として記録する"}
        </Button>
      </aside>
    </section>
  );
}

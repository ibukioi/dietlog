"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { type FoodHit, FoodSearch } from "@/components/food-search";
import { Field, NativeSelect, parseNum, useDebounced } from "@/components/form-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { RecipeResult } from "@/domain/calc/home-cooked";
import { COOKING_METHODS, type CookingMethodCode } from "@/domain/mext/cooking";

import { getRecipeForEdit, logHomeCooked, previewHomeCooked } from "./actions";
import type { RecipeSummary, Where } from "./log-client";

type Role = "ingredient" | "oil" | "seasoning";
type Unit = "g" | "ml" | "tbsp" | "tsp";
type Basis = "raw" | "purchased" | "cooked";

interface Row {
  key: string;
  role: Role;
  foodNo: string;
  name: string;
  amount: string;
  unit: Unit;
  weightBasis: Basis;
  method: CookingMethodCode;
  consumeAll: boolean;
  /** 調理後データがある調理法 */
  cookedMethods?: Array<{ method: string; cookedName: string; weightChangeRate: number }>;
}

const UNIT_LABEL: Record<Unit, string> = { g: "g", ml: "mL", tbsp: "大さじ", tsp: "小さじ" };
const BASIS_LABEL: Record<Basis, string> = { raw: "生の可食部", purchased: "皮・骨など込み", cooked: "調理後に量った" };
const PATH_LABEL = { raw: "生のまま", cooked_data: "調理後データ", fallback: "補正で計算" } as const;

type Spec = {
  role: Role;
  foodNo: string;
  amount: number;
  unit: Unit;
  weightBasis: Basis;
  method: CookingMethodCode;
  consumeAll: boolean;
};

const newKey = () => Math.random().toString(36).slice(2);

async function fetchMethods(foodNo: string) {
  const r = await fetch(`/api/foods/${foodNo}`);
  if (!r.ok) return [];
  const j = await r.json();
  return j.cookedMethods as Row["cookedMethods"];
}

function fmt(n: number | null | undefined, d = 1) {
  return n == null ? "—" : n.toLocaleString("ja-JP", { maximumFractionDigits: d });
}

export function HomeCookedTab({
  where,
  recipes,
  editRecipeId,
  onLogged,
}: {
  where: Where;
  recipes: RecipeSummary[];
  editRecipeId: string | null;
  onLogged: () => void;
}) {
  const [recipeId, setRecipeId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [servings, setServings] = useState("1");
  const [eaten, setEaten] = useState("1");
  const [rows, setRows] = useState<Row[]>([]);
  const [saveAsTag, setSaveAsTag] = useState(false);
  const [calc, setCalc] = useState<{ key: string; result: RecipeResult | null; error: string | null }>({
    key: "",
    result: null,
    error: null,
  });
  const [pending, start] = useTransition();
  const loadedRef = useRef(false);

  async function loadRecipe(id: string) {
    const r = await getRecipeForEdit(id);
    if (!r) return;
    setRecipeId(r.id);
    setName(r.name);
    setServings(String(r.servings));
    setEaten("1");
    setSaveAsTag(true);
    const loaded: Row[] = await Promise.all(
      r.ingredients.map(async (i) => ({
        key: newKey(),
        role: i.role,
        foodNo: i.foodNo,
        name: i.name,
        amount: String(i.amount),
        unit: i.unit,
        weightBasis: i.weightBasis,
        method: i.method as CookingMethodCode,
        consumeAll: i.consumeAll,
        cookedMethods: i.role === "ingredient" ? await fetchMethods(i.foodNo) : [],
      })),
    );
    setRows(loaded);
  }

  useEffect(() => {
    if (editRecipeId && !loadedRef.current) {
      loadedRef.current = true;
      void loadRecipe(editRecipeId);
    }
  }, [editRecipeId]);

  async function addFood(role: Role, h: FoodHit) {
    const row: Row = {
      key: newKey(),
      role,
      foodNo: h.foodNo,
      name: h.nameDisplay,
      amount: role === "ingredient" ? "100" : role === "oil" ? "1" : "1",
      unit: role === "ingredient" ? "g" : role === "oil" ? "tbsp" : "tsp",
      weightBasis: "raw",
      method: "raw",
      consumeAll: false,
      cookedMethods: [],
    };
    setRows((rs) => [...rs, row]);
    if (role === "ingredient") {
      const cm = await fetchMethods(h.foodNo);
      setRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, cookedMethods: cm } : r)));
    }
  }

  const update = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const specs = useMemo<Spec[]>(
    () =>
      rows
        .map((r) => ({
          role: r.role,
          foodNo: r.foodNo,
          amount: parseNum(r.amount) ?? 0,
          unit: r.unit,
          weightBasis: r.weightBasis,
          method: r.role === "ingredient" ? r.method : ("raw" as const),
          consumeAll: r.consumeAll,
        }))
        .filter((s) => s.amount > 0),
    [rows],
  );
  const servingsN = parseNum(servings) ?? 1;
  const debounced = useDebounced(JSON.stringify({ specs, servingsN }), 350);

  useEffect(() => {
    const parsed = JSON.parse(debounced) as { specs: Spec[]; servingsN: number };
    if (parsed.specs.length === 0 || !(parsed.servingsN > 0)) return;
    let cancelled = false;
    previewHomeCooked({ ingredients: parsed.specs, servings: parsed.servingsN })
      .then((r) => !cancelled && setCalc({ key: debounced, result: r, error: null }))
      .catch(
        () =>
          !cancelled &&
          setCalc({ key: debounced, result: null, error: "計算できませんでした。分量を確認してください。" }),
      );
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  // 食材が空なら結果を出さない。入力途中は直前の結果を表示し続ける
  const result = specs.length === 0 ? null : calc.result;
  const calcError = specs.length === 0 ? null : calc.error;
  const eatenN = parseNum(eaten) ?? 1;
  const per = result?.perServing;
  const mine = (code: string) => (per?.[code] == null ? null : (per[code] as number) * eatenN);

  function submit() {
    if (!name.trim()) return toast.error("料理名を入力してください");
    if (!specs.some((s) => s.role === "ingredient" || s.role === "seasoning"))
      return toast.error("食材を追加してください");
    start(async () => {
      await logHomeCooked({
        ...where,
        recipeId: recipeId ?? undefined,
        name: name.trim(),
        ingredients: specs,
        servings: servingsN,
        eatenServings: eatenN,
        saveAsTag,
      });
      toast.success(saveAsTag ? `${name}を記録し、タグに保存しました` : `${name}を記録しました`);
      onLogged();
    });
  }

  const ingredients = rows.filter((r) => r.role === "ingredient");
  const oils = rows.filter((r) => r.role === "oil");
  const seasonings = rows.filter((r) => r.role === "seasoning");

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className="grid content-start gap-5">
        {recipes.length > 0 && (
          <Field label="保存したタグから読み込む" htmlFor="load-tag">
            <NativeSelect
              id="load-tag"
              value={recipeId ?? ""}
              onChange={(e) => e.target.value && loadRecipe(e.target.value)}
            >
              <option value="">新しい料理</option>
              {recipes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        )}
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
          <Field label="料理名" htmlFor="cook-name">
            <Input
              id="cook-name"
              value={name}
              maxLength={60}
              placeholder="例: 鶏むねの照り焼き"
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="何人前作った?" htmlFor="cook-servings">
            <Input
              id="cook-servings"
              inputMode="decimal"
              value={servings}
              onChange={(e) => setServings(e.target.value)}
            />
          </Field>
          <Field label="食べた量(人前)" htmlFor="cook-eaten">
            <Input id="cook-eaten" inputMode="decimal" value={eaten} onChange={(e) => setEaten(e.target.value)} />
          </Field>
        </div>

        <section className="grid gap-2" aria-labelledby="ing-title">
          <h2 id="ing-title" className="font-bold">
            食材
          </h2>
          {ingredients.map((r) => {
            const hasData = new Set((r.cookedMethods ?? []).map((m) => m.method));
            return (
              <div key={r.key} className="grid gap-2 rounded-lg border border-border bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">{r.name}</p>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${r.name}を外す`}
                    onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-[90px_1fr_1fr]">
                  <Field label="重さ(g)" htmlFor={`${r.key}-a`}>
                    <Input
                      id={`${r.key}-a`}
                      inputMode="decimal"
                      value={r.amount}
                      onChange={(e) => update(r.key, { amount: e.target.value })}
                    />
                  </Field>
                  <Field label="量った状態" htmlFor={`${r.key}-b`}>
                    <NativeSelect
                      id={`${r.key}-b`}
                      value={r.weightBasis}
                      onChange={(e) => update(r.key, { weightBasis: e.target.value as Basis })}
                    >
                      {(Object.keys(BASIS_LABEL) as Basis[]).map((b) => (
                        <option key={b} value={b}>
                          {BASIS_LABEL[b]}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field label="調理法" htmlFor={`${r.key}-m`} className="col-span-2 sm:col-span-1">
                    <NativeSelect
                      id={`${r.key}-m`}
                      value={r.method}
                      onChange={(e) => update(r.key, { method: e.target.value as CookingMethodCode })}
                    >
                      {COOKING_METHODS.map((m) => (
                        <option key={m.code} value={m.code}>
                          {m.nameJa}
                          {m.code !== "raw" && (hasData.has(m.code) ? " ★成分表の調理後データ" : "")}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                </div>
              </div>
            );
          })}
          <FoodSearch
            mode="ingredient"
            label="食材を追加"
            placeholder="食材を追加(例: 鶏むね、ほうれんそう、たまねぎ)"
            onPick={(h) => addFood("ingredient", h)}
          />
        </section>

        <section className="grid gap-2" aria-labelledby="oil-title">
          <h2 id="oil-title" className="font-bold">
            油
          </h2>
          <p className="text-xs text-muted-foreground">
            炒め物・揚げ物で使った油の量。食材に吸着した分だけを加算します(全部食べた場合はチェック)。成分表の調理後データを使う食材は、油が含まれているので加算しません。
          </p>
          {oils.map((r) => (
            <SmallRow
              key={r.key}
              r={r}
              update={update}
              remove={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
              withConsumeAll
            />
          ))}
          <FoodSearch
            mode="seasoning"
            label="油を追加"
            placeholder="油を追加(例: サラダ油、ごま油、オリーブ油)"
            onPick={(h) => addFood("oil", h)}
          />
        </section>

        <section className="grid gap-2" aria-labelledby="sea-title">
          <h2 id="sea-title" className="font-bold">
            調味料
          </h2>
          {seasonings.map((r) => (
            <SmallRow
              key={r.key}
              r={r}
              update={update}
              remove={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
            />
          ))}
          <FoodSearch
            mode="seasoning"
            label="調味料を追加"
            placeholder="調味料を追加(例: しょうゆ、みそ、砂糖)"
            onPick={(h) => addFood("seasoning", h)}
          />
        </section>
      </div>

      <aside className="grid content-start gap-4 lg:sticky lg:top-20">
        <div className="status-window grid gap-3 p-4" aria-live="polite">
          <h2 className="font-num">けいさん結果</h2>
          {!result ? (
            <p className="text-sm text-muted-foreground">{calcError ?? "食材を追加すると、ここに計算結果が出ます。"}</p>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted-foreground">食べた分のエネルギー</dt>
                <dd className="text-right font-num text-xl tabular-nums">{fmt(mine("ENERC_KCAL"), 0)} kcal</dd>
                <dt className="text-muted-foreground">たんぱく質</dt>
                <dd className="text-right tabular-nums">{fmt(mine("PROT-"))} g</dd>
                <dt className="text-muted-foreground">脂質</dt>
                <dd className="text-right tabular-nums">{fmt(mine("FAT-"))} g</dd>
                <dt className="text-muted-foreground">炭水化物</dt>
                <dd className="text-right tabular-nums">{fmt(mine("CHOCDF-"))} g</dd>
                <dt className="text-muted-foreground">食塩相当量</dt>
                <dd className="text-right tabular-nums">{fmt(mine("NACL_EQ"))} g</dd>
              </dl>
              <p className="text-xs text-muted-foreground">
                全体 {fmt(result.total.ENERC_KCAL as number, 0)} kcal ÷ {result.servings} 人前 × {eatenN}{" "}
                人前。調理後の重さ 約 {fmt(result.cookedWeightG, 0)} g
              </p>
            </>
          )}
        </div>

        {result && (
          <details className="rounded-lg border border-border bg-white p-4 text-sm" open>
            <summary className="cursor-pointer font-bold">計算の内訳</summary>
            <ul className="mt-3 grid gap-3">
              {result.lines.map((l, i) => (
                <li key={i} className="grid gap-0.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span>
                      {l.name}
                      <Badge
                        variant={l.path === "cooked_data" ? "default" : "outline"}
                        className="ml-1.5 h-5 text-[10px]"
                      >
                        {PATH_LABEL[l.path]}
                      </Badge>
                    </span>
                    <span className="shrink-0 tabular-nums">{fmt(l.nutrients.ENERC_KCAL as number, 0)} kcal</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    生 {fmt(l.rawGrams, 0)} g
                    {l.weightChangeRate
                      ? ` → 調理後 ${fmt(l.cookedGrams, 0)} g(重量変化率 ${l.weightChangeRate}%)`
                      : ""}
                  </span>
                  {l.notes.map((n) => (
                    <span key={n} className="text-xs text-muted-foreground">
                      {n}
                    </span>
                  ))}
                </li>
              ))}
              {result.oil.map((o, i) => (
                <li key={`oil-${i}`} className="flex items-baseline justify-between gap-2">
                  <span>
                    {o.name}
                    <span className="ml-1 text-xs text-muted-foreground">
                      {o.source === "default"
                        ? "(吸油量の推定)"
                        : `使用 ${fmt(o.usedG)} g のうち ${fmt(o.absorbedG)} g`}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums">{fmt(o.nutrients.ENERC_KCAL as number, 0)} kcal</span>
                </li>
              ))}
            </ul>
            {result.notes.length > 0 && (
              <ul className="mt-3 grid gap-1 text-xs text-muted-foreground">
                {result.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              出典:
              日本食品標準成分表(八訂)増補2023年。★の調理法は成分表の調理後データ、それ以外は重量変化率と吸油量の中央値で補正しています。
            </p>
          </details>
        )}

        <div className="grid gap-3 rounded-lg border border-border bg-white p-4">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={saveAsTag} onCheckedChange={(v) => setSaveAsTag(Boolean(v))} />
            {recipeId ? "タグの内容を更新する" : "この料理をタグとして保存する(次回ワンタップで記録)"}
          </label>
          <Button size="lg" disabled={pending || !result} onClick={submit}>
            {pending ? "記録しています…" : "記録する"}
          </Button>
        </div>
      </aside>
    </div>
  );
}

function SmallRow({
  r,
  update,
  remove,
  withConsumeAll,
}: {
  r: Row;
  update: (key: string, patch: Partial<Row>) => void;
  remove: () => void;
  withConsumeAll?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-white px-3 py-2">
      <span className="min-w-0 flex-1 truncate text-sm">{r.name}</span>
      <Input
        aria-label={`${r.name}の量`}
        inputMode="decimal"
        className="w-20"
        value={r.amount}
        onChange={(e) => update(r.key, { amount: e.target.value })}
      />
      <NativeSelect
        aria-label={`${r.name}の単位`}
        value={r.unit}
        onChange={(e) => update(r.key, { unit: e.target.value as Unit })}
      >
        {(Object.keys(UNIT_LABEL) as Unit[]).map((u) => (
          <option key={u} value={u}>
            {UNIT_LABEL[u]}
          </option>
        ))}
      </NativeSelect>
      {withConsumeAll && (
        <label className="flex items-center gap-1.5 text-xs">
          <Checkbox checked={r.consumeAll} onCheckedChange={(v) => update(r.key, { consumeAll: Boolean(v) })} />
          全部食べた
        </label>
      )}
      <Button variant="ghost" size="icon-sm" aria-label={`${r.name}を外す`} onClick={remove}>
        <Trash2 />
      </Button>
    </div>
  );
}

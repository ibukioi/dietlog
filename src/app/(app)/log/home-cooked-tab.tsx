"use client";

import { Tags, Trash2 } from "lucide-react";
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

import { deleteRecipeAction } from "../recipes/actions";

import {
  getMealItemForCookEdit,
  getRecipeForEdit,
  logHomeCooked,
  previewHomeCooked,
  updateHomeCooked,
  updateRecipeAction,
} from "./actions";
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
const PATH_LABEL = { raw: "生のまま", soup: "汁ごと", cooked_data: "調理後データ", fallback: "補正で計算" } as const;

type Spec = {
  role: Role;
  foodNo: string;
  amount: number;
  unit: Unit;
  weightBasis: Basis;
  method: CookingMethodCode;
  consumeAll: boolean;
};

/** 油の欄のショートカット(食品番号は成分表 14 群) */
const COMMON_OILS = [
  { foodNo: "14006", label: "サラダ油(調合油)", name: "調合油" },
  { foodNo: "14002", label: "ごま油", name: "ごま油" },
  { foodNo: "14001", label: "オリーブ油", name: "オリーブ油" },
  { foodNo: "14008", label: "なたね油", name: "なたね油" },
  { foodNo: "14017", label: "バター(有塩)", name: "無発酵バター 有塩バター" },
] as const;

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
  editItemId,
  editTagId,
  onLogged,
  onTagDone,
}: {
  where: Where;
  recipes: RecipeSummary[];
  editRecipeId: string | null;
  /** 記録済みの自炊を材料・分量から編集する(上書き保存) */
  editItemId: string | null;
  /** タグだけを編集する(保存しても食事は記録しない) */
  editTagId: string | null;
  onLogged: () => void;
  /** タグの保存・削除のあと */
  onTagDone: () => void;
}) {
  const [recipeId, setRecipeId] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
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

  /** 「新しい料理」を選んだら、読み込んだタグの内容を消して新規作成に戻す */
  function resetForm() {
    setRecipeId(null);
    setEditingItemId(null);
    setEditingTagId(null);
    setName("");
    setServings("1");
    setEaten("1");
    setRows([]);
    setSaveAsTag(false);
  }

  async function toRows(
    ingredients: Array<{
      role: Role;
      foodNo: string;
      name: string;
      amount: number;
      unit: Unit;
      weightBasis: Basis;
      method: string;
      consumeAll?: boolean;
    }>,
  ): Promise<Row[]> {
    return Promise.all(
      ingredients.map(async (i) => ({
        key: newKey(),
        role: i.role,
        foodNo: i.foodNo,
        name: i.name,
        amount: String(i.amount),
        unit: i.unit,
        weightBasis: i.weightBasis,
        method: i.method as CookingMethodCode,
        consumeAll: Boolean(i.consumeAll),
        cookedMethods: i.role === "ingredient" ? await fetchMethods(i.foodNo) : [],
      })),
    );
  }

  async function applyItem(it: Awaited<ReturnType<typeof getMealItemForCookEdit>>) {
    if (!it) {
      toast.error("この記録は材料から編集できません");
      return;
    }
    setEditingItemId(it.itemId);
    setRecipeId(it.recipeId);
    setName(it.name);
    setServings(String(it.servings));
    setEaten(String(it.eatenServings));
    setSaveAsTag(false);
    setRows(await toRows(it.ingredients));
  }

  function loadRecipe(id: string) {
    return getRecipeForEdit(id).then(applyRecipe);
  }

  async function applyRecipe(r: Awaited<ReturnType<typeof getRecipeForEdit>>) {
    if (!r) return;
    setEditingItemId(null);
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
    if (loadedRef.current) return;
    if (editTagId) {
      loadedRef.current = true;
      void getRecipeForEdit(editTagId).then(async (r) => {
        if (!r) {
          toast.error("タグが見つかりません");
          return;
        }
        await applyRecipe(r);
        setEditingTagId(r.id);
      });
    } else if (editItemId) {
      loadedRef.current = true;
      // 取得後のコールバックで state を更新する(effect 内で同期的に setState しない)
      void getMealItemForCookEdit(editItemId).then(applyItem);
    } else if (editRecipeId) {
      loadedRef.current = true;
      void getRecipeForEdit(editRecipeId).then(applyRecipe);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRecipeId, editItemId, editTagId]);

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
    const body = {
      ...where,
      recipeId: recipeId ?? undefined,
      name: name.trim(),
      ingredients: specs,
      servings: servingsN,
      eatenServings: eatenN,
      saveAsTag,
    };
    start(async () => {
      if (editingTagId) {
        await updateRecipeAction({ recipeId: editingTagId, name: body.name, ingredients: specs, servings: servingsN });
        toast.success(`タグ「${body.name}」を保存しました`);
        onTagDone();
        return;
      }
      if (editingItemId) {
        await updateHomeCooked({ ...body, itemId: editingItemId });
        toast.success(`${name}を更新しました`);
      } else {
        await logHomeCooked(body);
        toast.success(saveAsTag ? `${name}を記録し、タグに保存しました` : `${name}を記録しました`);
      }
      onLogged();
    });
  }

  function removeTag() {
    if (!editingTagId) return;
    if (!confirm(`タグ「${name}」を削除しますか?(記録済みの食事は残ります)`)) return;
    const id = editingTagId;
    start(async () => {
      await deleteRecipeAction(id);
      toast.success(`タグ「${name}」を削除しました`);
      onTagDone();
    });
  }

  const ingredients = rows.filter((r) => r.role === "ingredient");
  const oils = rows.filter((r) => r.role === "oil");
  const seasonings = rows.filter((r) => r.role === "seasoning");

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className="grid min-w-0 content-start gap-5">
        {editingItemId && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--brand-soft)] px-4 py-3 text-sm">
            <span>記録済みの「{name}」を編集しています。保存すると、この記録を計算し直して上書きします。</span>
            <Button variant="ghost" size="sm" onClick={resetForm}>
              新しく記録する
            </Button>
          </div>
        )}
        {editingTagId && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--brand-soft)] px-4 py-3 text-sm">
            <span className="flex items-center gap-2">
              <Tags className="size-4 shrink-0 text-[var(--brand)]" aria-hidden />
              タグ「{name}」を編集しています。保存しても食事は記録されません。
            </span>
            <span className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={onTagDone}>
                やめる
              </Button>
              <Button variant="ghost" size="sm" className="text-destructive" disabled={pending} onClick={removeTag}>
                タグを削除
              </Button>
            </span>
          </div>
        )}
        {recipes.length > 0 && !editingItemId && !editingTagId && (
          <Field label="保存したタグから読み込む" htmlFor="load-tag">
            <NativeSelect
              id="load-tag"
              value={recipeId ?? ""}
              onChange={(e) => (e.target.value ? loadRecipe(e.target.value) : resetForm())}
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
          {!editingTagId && (
            <Field label="食べた量(人前)" htmlFor="cook-eaten">
              <Input id="cook-eaten" inputMode="decimal" value={eaten} onChange={(e) => setEaten(e.target.value)} />
            </Field>
          )}
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
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="よく使う油">
            {COMMON_OILS.map((o) => (
              <Button
                key={o.foodNo}
                type="button"
                size="sm"
                variant="outline"
                className="rounded-full"
                onClick={() =>
                  addFood("oil", {
                    foodNo: o.foodNo,
                    nameDisplay: o.name,
                    groupCode: "14",
                    isCooked: false,
                    isDish: false,
                    energyKcal: null,
                  })
                }
              >
                + {o.label}
              </Button>
            ))}
          </div>
          <FoodSearch
            mode="oil"
            label="油を追加"
            placeholder="ほかの油を探す(例: なたね油、米油、バター)"
            onPick={(h) => addFood("oil", h)}
          />
          <p className="text-xs text-muted-foreground">
            成分表に「サラダ油」という食品はありません。一般的なサラダ油は「調合油」(なたね油と大豆油を1:1)で計算します。
          </p>
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
          <h2 className="text-sm font-medium text-[var(--brand-deep)]">計算結果</h2>
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
          {!editingTagId && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={saveAsTag} onCheckedChange={(v) => setSaveAsTag(Boolean(v))} />
              {recipeId ? "タグの内容を更新する" : "この料理をタグとして保存する(次回ワンタップで記録)"}
            </label>
          )}
          <Button size="lg" disabled={pending || !result} onClick={submit}>
            {pending ? "保存しています…" : editingTagId ? "タグを保存" : editingItemId ? "変更を保存" : "記録する"}
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

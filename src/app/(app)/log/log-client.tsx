"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Field, NativeSelect } from "@/components/form-bits";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MEAL_TYPES, MEAL_TYPE_LABEL, type MealType } from "@/lib/dates";

import { DishTab } from "./dish-tab";
import { HomeCookedTab } from "./home-cooked-tab";
import { ManualTab } from "./manual-tab";
import { ProductTab } from "./product-tab";
import { QuickTab } from "./quick-tab";

export interface ProductSummary {
  id: string;
  name: string;
  brand: string | null;
  source: string;
  basis: "per_100g" | "per_serving";
  servingLabel: string | null;
  servingSizeG: number | null;
  kcal: number | null;
  /** 検索用の読み(ひらがな) */
  reading: string;
}
export interface RecipeSummary {
  id: string;
  name: string;
  servings: number;
  ingredientCount: number;
}
export interface Where {
  date: string;
  mealType: MealType;
}

export function LogClient(props: {
  initialDate: string;
  today: string;
  initialMeal: MealType;
  initialTab: string;
  editRecipeId: string | null;
  editItemId: string | null;
  /** タグ(レシピ)だけを編集する(記録はしない) */
  editTagId: string | null;
  tagReturnTo: string | null;
  uploadsEnabled: boolean;
  products: ProductSummary[];
  recipes: RecipeSummary[];
}) {
  const router = useRouter();
  const [where, setWhere] = useState<Where>({ date: props.initialDate, mealType: props.initialMeal });
  const [tab, setTab] = useState(props.initialTab);
  const afterLog = () => router.push(`/home?date=${where.date}`);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-white p-3">
        <Field label="日付" htmlFor="log-date">
          <Input
            id="log-date"
            type="date"
            max={props.today}
            value={where.date}
            onChange={(e) => e.target.value && setWhere({ ...where, date: e.target.value })}
            className="w-40"
          />
        </Field>
        <Field label="食事" htmlFor="log-meal">
          <NativeSelect
            id="log-meal"
            value={where.mealType}
            onChange={(e) => setWhere({ ...where, mealType: e.target.value as MealType })}
          >
            {MEAL_TYPES.map((m) => (
              <option key={m} value={m}>
                {MEAL_TYPE_LABEL[m]}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
        <TabsList className="h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="quick">よく使う</TabsTrigger>
          <TabsTrigger value="product">市販品</TabsTrigger>
          <TabsTrigger value="dish">料理・惣菜</TabsTrigger>
          <TabsTrigger value="cook">自炊</TabsTrigger>
          <TabsTrigger value="manual">手入力</TabsTrigger>
        </TabsList>
        <TabsContent value="quick" className="pt-2">
          <QuickTab
            where={where}
            products={props.products}
            recipes={props.recipes}
            onLogged={afterLog}
            goTab={setTab}
          />
        </TabsContent>
        <TabsContent value="product" className="pt-2">
          <ProductTab
            where={where}
            products={props.products}
            uploadsEnabled={props.uploadsEnabled}
            onLogged={afterLog}
            goTab={setTab}
          />
        </TabsContent>
        <TabsContent value="dish" className="pt-2">
          <DishTab where={where} onLogged={afterLog} goTab={setTab} />
        </TabsContent>
        <TabsContent value="cook" className="pt-2">
          <HomeCookedTab
            where={where}
            recipes={props.recipes}
            editRecipeId={props.editRecipeId}
            editItemId={props.editItemId}
            editTagId={props.editTagId}
            onLogged={afterLog}
            onTagDone={() =>
              router.push(props.tagReturnTo ?? `/log?tab=quick&date=${where.date}&meal=${where.mealType}`)
            }
          />
        </TabsContent>
        <TabsContent value="manual" className="pt-2">
          <ManualTab where={where} uploadsEnabled={props.uploadsEnabled} onLogged={afterLog} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

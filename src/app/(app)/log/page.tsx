import type { Metadata } from "next";

import { type MealType, MEAL_TYPES, guessMealType, isIsoDate, todayIso } from "@/lib/dates";
import { requireUser } from "@/server/auth/session";
import { getMealItem } from "@/server/repositories/meals";
import { listMyProducts } from "@/server/repositories/products";
import { listRecipes } from "@/server/repositories/recipes";

import { LogClient } from "./log-client";

export const metadata: Metadata = { title: "記録する" };

export default async function LogPage({
  searchParams,
}: {
  searchParams: Promise<{
    date?: string;
    meal?: string;
    tab?: string;
    recipe?: string;
    editItem?: string;
    editTag?: string;
    from?: string;
  }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const today = todayIso();
  // 記録済みの自炊を編集するときは、その記録の日付・食事区分で開く
  const editItem = sp.editItem && /^[0-9a-f-]{36}$/.test(sp.editItem) ? await getMealItem(user.id, sp.editItem) : null;
  const date = editItem?.eatenOn ?? (isIsoDate(sp.date) && sp.date <= today ? sp.date : today);
  const meal =
    editItem?.mealType ??
    ((MEAL_TYPES as readonly string[]).includes(sp.meal ?? "") ? (sp.meal as MealType) : guessMealType());
  const editTagId = sp.editTag && /^[0-9a-f-]{36}$/.test(sp.editTag) ? sp.editTag : null;
  const [products, recipes] = await Promise.all([listMyProducts(user.id), listRecipes(user.id)]);

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-bold tracking-tight">記録する</h1>
      <LogClient
        // 編集対象が変わったらフォームを作り直す
        key={editItem?.id ?? editTagId ?? sp.recipe ?? "new"}
        initialDate={date}
        today={today}
        initialMeal={meal}
        initialTab={editItem || editTagId ? "cook" : (sp.tab ?? (sp.recipe ? "cook" : "quick"))}
        editRecipeId={sp.recipe ?? null}
        editTagId={editTagId}
        // タグの管理画面から来たら、保存後はそこへ戻す
        tagReturnTo={sp.from === "recipes" ? "/recipes" : null}
        editItemId={editItem?.kind === "home_cooked" ? editItem.id : null}
        uploadsEnabled={Boolean(process.env.BLOB_READ_WRITE_TOKEN)}
        products={products.map((p) => ({
          id: p.id,
          name: p.name,
          brand: p.brand,
          source: p.source,
          basis: p.basis,
          servingLabel: p.servingLabel,
          servingSizeG: p.servingSizeG,
          kcal: p.nutrientsJson.ENERC_KCAL ?? null,
        }))}
        recipes={recipes.map((r) => ({
          id: r.id,
          name: r.name,
          servings: r.servings,
          ingredientCount: r.ingredientCount,
        }))}
      />
    </div>
  );
}

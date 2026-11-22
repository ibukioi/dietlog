import type { Metadata } from "next";

import { type MealType, MEAL_TYPES, guessMealType, isIsoDate, todayIso } from "@/lib/dates";
import { requireUser } from "@/server/auth/session";
import { listMyProducts } from "@/server/repositories/products";
import { listRecipes } from "@/server/repositories/recipes";

import { LogClient } from "./log-client";

export const metadata: Metadata = { title: "記録する" };

export default async function LogPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; meal?: string; tab?: string; recipe?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const today = todayIso();
  const date = isIsoDate(sp.date) && sp.date <= today ? sp.date : today;
  const meal = (MEAL_TYPES as readonly string[]).includes(sp.meal ?? "") ? (sp.meal as MealType) : guessMealType();
  const [products, recipes] = await Promise.all([listMyProducts(user.id), listRecipes(user.id)]);

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-bold tracking-tight">記録する</h1>
      <LogClient
        initialDate={date}
        today={today}
        initialMeal={meal}
        initialTab={sp.tab ?? (sp.recipe ? "cook" : "quick")}
        editRecipeId={sp.recipe ?? null}
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

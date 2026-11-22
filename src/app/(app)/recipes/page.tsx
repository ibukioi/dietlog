import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/server/auth/session";
import { listRecipes } from "@/server/repositories/recipes";

import { DeleteRecipeButton } from "./delete-button";
import { RiceBowl } from "@/components/food-illustrations";

export const metadata: Metadata = { title: "タグ" };

export default async function RecipesPage() {
  const user = await requireUser();
  const recipes = await listRecipes(user.id);
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">自炊のタグ</h1>
          <p className="text-sm text-muted-foreground">
            よく作る料理を保存しておくと、記録画面からワンタップで呼び出せます。
          </p>
        </div>
        <Link href="/log?tab=cook" className={buttonVariants()}>
          新しい料理を作る
        </Link>
      </div>
      {recipes.length === 0 ? (
        <div className="flex items-center gap-5 rounded-2xl border border-dashed border-border bg-white p-6 text-sm text-muted-foreground">
          <RiceBowl className="size-14" />
          <p>まだタグがありません。自炊を記録するときに「タグとして保存する」にチェックを入れると、ここに並びます。</p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {recipes.map((r) => (
            <li key={r.id} className="grid gap-3 rounded-lg border border-border bg-white p-4">
              <div>
                <p className="font-bold">{r.name}</p>
                <p className="text-xs text-muted-foreground">
                  {r.servings} 人前・食材 {r.ingredientCount} 品・記録 {r.useCount} 回
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/log?tab=quick`} className={buttonVariants({ size: "sm" })}>
                  記録する
                </Link>
                <Link
                  href={`/log?tab=cook&recipe=${r.id}`}
                  className={buttonVariants({ size: "sm", variant: "outline" })}
                >
                  分量を変えて記録・編集
                </Link>
                <DeleteRecipeButton id={r.id} name={r.name} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

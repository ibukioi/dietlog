import { NextResponse } from "next/server";

import { CORE } from "@/domain/nutrients/catalog";
import { getCurrentUser } from "@/server/auth/session";
import { cookedVariantsFor, getFood } from "@/server/repositories/mext";

/** 食品 1 件の主要成分と、調理後データがある調理法 */
export async function GET(_req: Request, ctx: { params: Promise<{ foodNo: string }> }) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { foodNo } = await ctx.params;
  if (!/^\d{5}$/.test(foodNo)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const food = await getFood(foodNo);
  if (!food) return NextResponse.json({ error: "not found" }, { status: 404 });
  const variants = await cookedVariantsFor(foodNo);
  const core = Object.fromEntries(Object.values(CORE).map((c) => [c, food.nutrients[c] ?? null]));
  return NextResponse.json({
    food: {
      foodNo: food.foodNo,
      name: food.name,
      groupCode: food.groupCode,
      refuseRate: food.refuseRate,
      densityGPerMl: food.densityGPerMl,
      per100g: core,
    },
    cookedMethods: variants.map((v) => ({
      method: v.method,
      cookedName: v.cookedName,
      weightChangeRate: v.weightChangeRate,
    })),
  });
}

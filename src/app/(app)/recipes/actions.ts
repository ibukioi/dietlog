"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/server/auth/session";
import { deleteRecipe } from "@/server/repositories/recipes";

export async function deleteRecipeAction(id: string) {
  const user = await requireUser();
  await deleteRecipe(user.id, z.string().uuid().parse(id));
  revalidatePath("/recipes");
}

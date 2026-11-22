"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/server/auth/session";
import { deleteMyProduct } from "@/server/repositories/products";

export async function deleteProductAction(id: string) {
  const user = await requireUser();
  await deleteMyProduct(user.id, z.string().uuid().parse(id));
  revalidatePath("/products");
}

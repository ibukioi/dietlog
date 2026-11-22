import type { Metadata } from "next";

import { requireUser } from "@/server/auth/session";
import { listMyProducts } from "@/server/repositories/products";

import { ProductsClient } from "./products-client";

export const metadata: Metadata = { title: "自分の商品" };

export default async function ProductsPage() {
  const user = await requireUser();
  const products = await listMyProducts(user.id, undefined, 200);
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">自分の商品</h1>
        <p className="text-sm text-muted-foreground">
          検索や手入力で記録した市販品・外食です。次回から記録画面ですぐに呼び出せます。値を直すと、これからの記録に反映されます(記録済みの食事は変わりません)。
        </p>
      </div>
      <ProductsClient
        uploadsEnabled={Boolean(process.env.BLOB_READ_WRITE_TOKEN)}
        products={products.map((p) => ({
          id: p.id,
          source: p.source,
          externalRef: p.externalRef,
          name: p.name,
          brand: p.brand,
          basis: p.basis,
          servingSizeG: p.servingSizeG,
          servingLabel: p.servingLabel,
          nutrients: p.nutrientsJson,
          imageBlobUrl: p.imageBlobUrl,
          useCount: p.useCount,
        }))}
      />
    </div>
  );
}

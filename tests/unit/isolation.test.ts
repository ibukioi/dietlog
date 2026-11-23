/**
 * DB を使う結合テスト(§1.3 リポジトリ/DB・§8.2 データ分離)
 * 一時ファイルの SQLite にマイグレーションとマスタデータを入れて検証する。
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const dir = mkdtempSync(path.join(tmpdir(), "dietlog-test-"));
const url = `file:${path.join(dir, "test.db")}`;
process.env.DATABASE_URL = url;

type Mods = {
  db: typeof import("@/server/db/client").db;
  s: typeof import("@/server/db/schema");
  meals: typeof import("@/server/repositories/meals");
  products: typeof import("@/server/repositories/products");
  recipes: typeof import("@/server/repositories/recipes");
  account: typeof import("@/server/repositories/account");
  guest: typeof import("@/server/services/guest");
  cleanup: typeof import("@/server/services/cleanup");
};
let m: Mods;

async function createUser(id: string, isAnonymous: boolean, guestExpiresAt: Date | null = null) {
  await m.db.insert(m.s.user).values({ id, name: id, email: `${id}@example.invalid`, isAnonymous, guestExpiresAt });
}

const item = (name: string) => ({
  date: "2026-11-20",
  mealType: "lunch" as const,
  kind: "manual" as const,
  name,
  quantity: 1,
  unit: "食",
  grams: null,
  nutrients: { ENERC_KCAL: 500, "PROT-": 20 },
  isEstimate: false,
  sourceLabel: "手入力",
});

beforeAll(async () => {
  const env = { ...process.env, DATABASE_URL: url };
  execFileSync("pnpm", ["-s", "db:migrate"], { env, stdio: "ignore" });
  execFileSync("pnpm", ["-s", "db:seed"], { env, stdio: "ignore" });
  m = {
    db: (await import("@/server/db/client")).db,
    s: await import("@/server/db/schema"),
    meals: await import("@/server/repositories/meals"),
    products: await import("@/server/repositories/products"),
    recipes: await import("@/server/repositories/recipes"),
    account: await import("@/server/repositories/account"),
    guest: await import("@/server/services/guest"),
    cleanup: await import("@/server/services/cleanup"),
  };
  await createUser("alice", true, new Date("2026-12-01"));
  await createUser("bob", true, new Date("2026-12-01"));
}, 120_000);

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("ユーザー間のデータ分離", () => {
  it("他人の記録は一覧に出ない", async () => {
    await m.meals.addMealItem("alice", item("alice のランチ"));
    await m.meals.addMealItem("bob", item("bob のランチ"));
    const a = await m.meals.listItemsInRange("alice", "2026-11-20", "2026-11-20");
    expect(a.map((i) => i.nameSnapshot)).toEqual(["alice のランチ"]);
  });

  it("他人の記録 ID を指定しても削除できない", async () => {
    const [bobs] = await m.meals.listItemsInRange("bob", "2026-11-20", "2026-11-20");
    expect(await m.meals.deleteMealItem("alice", bobs.id)).toBe(false);
    expect(await m.meals.listItemsInRange("bob", "2026-11-20", "2026-11-20")).toHaveLength(1);
    expect(await m.meals.deleteMealItem("bob", bobs.id)).toBe(true);
  });

  it("他人の商品は取得・更新できない", async () => {
    const id = await m.products.saveMyProduct("alice", {
      source: "manual",
      externalRef: null,
      name: "alice の商品",
      brand: null,
      basis: "per_serving",
      servingSizeG: null,
      servingLabel: "1個",
      nutrientsJson: { ENERC_KCAL: 100 },
      isEstimate: false,
    });
    expect(await m.products.getMyProduct("bob", id)).toBeNull();
    await expect(
      m.products.saveMyProduct(
        "bob",
        {
          source: "manual",
          externalRef: null,
          name: "乗っ取り",
          brand: null,
          basis: "per_serving",
          servingSizeG: null,
          servingLabel: null,
          nutrientsJson: {},
          isEstimate: false,
        },
        id,
      ),
    ).rejects.toThrow();
    expect((await m.products.getMyProduct("alice", id))?.name).toBe("alice の商品");
  });
});

describe("記録の編集", () => {
  it("他人の記録は編集できない", async () => {
    const [a] = await m.meals.listItemsInRange("alice", "2026-11-20", "2026-11-20");
    expect(await m.meals.updateMealItem("bob", a.id, { name: "乗っ取り" })).toBe(false);
    expect((await m.meals.getMealItem("alice", a.id))?.nameSnapshot).toBe("alice のランチ");
  });

  it("日付・食事区分を変えると、その日の別の食事に移る", async () => {
    const [a] = await m.meals.listItemsInRange("alice", "2026-11-20", "2026-11-20");
    expect(
      await m.meals.updateMealItem("alice", a.id, {
        date: "2026-11-19",
        mealType: "dinner",
        name: "alice の夕食",
        nutrients: { ENERC_KCAL: 750, "PROT-": 30 },
      }),
    ).toBe(true);
    const moved = await m.meals.getMealItem("alice", a.id);
    expect(moved).toMatchObject({
      eatenOn: "2026-11-19",
      mealType: "dinner",
      nameSnapshot: "alice の夕食",
      energyKcal: 750,
    });
    // 元に戻す(後続のテストのため)
    await m.meals.updateMealItem("alice", a.id, { date: "2026-11-20", mealType: "lunch" });
  });
});

describe("タグの編集", () => {
  const ing = (amount: number) => ({
    role: "ingredient" as const,
    foodNo: "06267",
    amount,
    unit: "g" as const,
    grams: amount,
    weightBasis: "raw" as const,
    cookingMethodCode: "boil",
    consumeAll: false,
  });

  it("名前・人数・材料を上書きできる", async () => {
    const id = await m.recipes.saveRecipe("alice", { name: "おひたし", servings: 1 }, [ing(100)]);
    await m.recipes.saveRecipe("alice", { name: "ほうれんそうのおひたし", servings: 2 }, [ing(200), ing(50)], id);
    const r = await m.recipes.getRecipe("alice", id);
    expect(r).toMatchObject({ name: "ほうれんそうのおひたし", servings: 2 });
    expect(r!.ingredients.map((i) => i.amount)).toEqual([200, 50]);
  });

  it("他人のタグは編集・削除できない", async () => {
    const id = await m.recipes.saveRecipe("alice", { name: "卵焼き", servings: 1 }, [ing(100)]);
    await expect(m.recipes.saveRecipe("bob", { name: "乗っ取り", servings: 1 }, [], id)).rejects.toThrow();
    expect(await m.recipes.deleteRecipe("bob", id)).toBe(false);
    const r = await m.recipes.getRecipe("alice", id);
    expect(r).toMatchObject({ name: "卵焼き" });
    expect(r!.ingredients).toHaveLength(1);
  });
});

describe("食品・商品の検索(漢字・かな)", () => {
  it.each(["手羽先", "手羽さき", "てばさき", "テバサキ"])("成分表: %s で手羽さきが見つかる", async (q) => {
    const { searchMextFoods } = await import("@/server/repositories/mext");
    const hits = await searchMextFoods(q, { mode: "ingredient" });
    expect(hits.some((h) => h.nameRaw.includes("手羽さき"))).toBe(true);
  });

  it("漢字でそのまま見つかるときは同音の別の食品を混ぜない", async () => {
    const { searchMextFoods } = await import("@/server/repositories/mext");
    const hits = await searchMextFoods("鮭", { mode: "ingredient" });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.nameRaw.includes("清酒"))).toBe(false);
  });

  it("Open Food Facts で見つからないときは、かな表記でも探す", async () => {
    const { searchOff } = await import("@/server/off/client");
    const searched: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const term = new URL(String(input)).searchParams.get("search_terms")!;
      searched.push(term);
      const products =
        term === "テバサキ" ? [{ code: "4900000000001", product_name: "テバサキ唐揚げ", nutriments: {} }] : [];
      return new Response(JSON.stringify({ products }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const r = await searchOff("手羽先");
      expect(searched).toEqual(["手羽先", "てばさき", "テバサキ"]);
      expect(r).toMatchObject({ status: "ok", products: [{ name: "テバサキ唐揚げ" }] });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("お試しモード", () => {
  it("サンプルデータは今日から相対の日付で入る", async () => {
    await createUser("guest1", true);
    const now = new Date("2026-11-22T03:00:00Z");
    const r = await m.guest.seedGuest("guest1", now);
    expect(r.items).toBeGreaterThan(30);
    const items = await m.meals.listItemsInRange("guest1", "2026-11-16", "2026-11-22");
    expect(new Set(items.map((i) => i.eatenOn)).size).toBe(7);
    expect(r.expires.getTime() - now.getTime()).toBe(14 * 86_400_000);
  }, 60_000);

  it("本登録で記録を引き継ぐ", async () => {
    await createUser("member1", false);
    await m.account.transferUserData(m.db, "guest1", "member1");
    expect(await m.meals.listItemsInRange("guest1", "2026-11-01", "2026-11-30")).toHaveLength(0);
    expect((await m.meals.listItemsInRange("member1", "2026-11-01", "2026-11-30")).length).toBeGreaterThan(30);
  });

  it("既存アカウントにログインしても、同じ日・食事・商品が重なったまま引き継げる", async () => {
    await createUser("guest2", true);
    await createUser("member2", false);
    const product = {
      source: "off" as const,
      externalRef: "4901234567890",
      name: "同じ商品",
      brand: null,
      basis: "per_100g" as const,
      servingSizeG: null,
      servingLabel: null,
      nutrientsJson: { ENERC_KCAL: 100 },
      imageBlobUrl: null,
      isEstimate: false,
    };
    const guestProduct = await m.products.saveMyProduct("guest2", product);
    const memberProduct = await m.products.saveMyProduct("member2", product);
    await m.meals.addMealItem("guest2", { ...item("お試しの昼食"), myProductId: guestProduct });
    await m.meals.addMealItem("member2", item("本登録の昼食"));
    await m.meals.setDayComplete("guest2", "2026-11-20", false);
    await m.meals.setDayComplete("member2", "2026-11-20", true);

    await m.account.transferUserData(m.db, "guest2", "member2");

    const items = await m.meals.listItemsInRange("member2", "2026-11-20", "2026-11-20");
    expect(items.map((i) => i.nameSnapshot).sort()).toEqual(["お試しの昼食", "本登録の昼食"].sort());
    expect(new Set(items.map((i) => i.mealId)).size).toBe(1);
    expect(items.find((i) => i.nameSnapshot === "お試しの昼食")?.myProductId).toBe(memberProduct);
    expect((await m.meals.getDayStatuses("member2", "2026-11-20", "2026-11-20")).get("2026-11-20")).toBe(true);
    expect(await m.meals.listItemsInRange("guest2", "2026-11-20", "2026-11-20")).toHaveLength(0);
  });

  it("期限切れのお試しユーザーは記録ごと削除される", async () => {
    await createUser("old-guest", true, new Date("2026-11-01"));
    await m.meals.addMealItem("old-guest", item("古い記録"));
    const r = await m.cleanup.cleanupExpired(new Date("2026-11-22"));
    expect(r.expiredGuests).toBe(1);
    expect(await m.meals.listItemsInRange("old-guest", "2026-11-01", "2026-11-30")).toHaveLength(0);
    // 期限内のユーザーは残る
    expect(await m.meals.listItemsInRange("alice", "2026-11-20", "2026-11-20")).toHaveLength(1);
  });
});

/**
 * DB を使う結合テスト(§1.3 リポジトリ/DB・§8.2 データ分離)
 * 一時ファイルの SQLite にマイグレーションとマスタデータを入れて検証する。
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { eq } from "drizzle-orm";
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
      const url = new URL(String(input));
      const term = url.searchParams.get("q") ?? url.searchParams.get("search_terms")!;
      searched.push(term);
      const products =
        term === "テバサキ" ? [{ code: "4900000000001", product_name: "テバサキ唐揚げ", nutriments: {} }] : [];
      return new Response(JSON.stringify({ hits: products, products }), { status: 200 });
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

describe("Open Food Facts の混雑時の動き", () => {
  const product = (code: string, name: string) => ({ code, product_name: name, nutriments: {} });
  // 新しい検索(search-a-licious)は hits、旧検索は products で返す
  const ok = (products: unknown[]) => new Response(JSON.stringify({ hits: products, products }), { status: 200 });
  const down = () => new Response("Page temporarily unavailable", { status: 503 });

  async function withFetch(handler: (term: string, host: string) => Response) {
    const { searchOff } = await import("@/server/off/client");
    const terms: string[] = [];
    const hosts: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = new URL(String(input));
        const term = url.searchParams.get("q") ?? url.searchParams.get("search_terms")!;
        terms.push(term);
        hosts.push(url.host);
        return handler(term, url.host);
      }),
    );
    return { searchOff, terms, hosts };
  }

  it("新しい検索の結果を使い、ブランド名の言語接頭辞を外す", async () => {
    const now = Date.UTC(2030, 0, 1, 0, 30, 5);
    const { searchOff, hosts } = await withFetch(() =>
      ok([{ ...product("4900000000104", "検証用のサラダチキン"), brands: ["xx:検証フーズ"] }]),
    );
    try {
      const r = await searchOff("検証用のサラダチキン", now);
      expect(r).toMatchObject({ status: "ok", products: [{ name: "検証用のサラダチキン", brand: "検証フーズ" }] });
      expect(hosts).toEqual(["search.openfoodfacts.org"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("かな表記で探し直したあとでも、続けて別の商品を検索できる", async () => {
    const now = Date.UTC(2030, 0, 1, 0, 0, 5);
    const { searchOff, terms } = await withFetch((term) =>
      term === "検証用の焼きそば" ? ok([product("4900000000101", "検証用の焼きそば")]) : ok([]),
    );
    try {
      expect((await searchOff("鶏軟骨", now)).status).toBe("ok");
      expect(terms.length).toBe(3);
      const second = await searchOff("検証用の焼きそば", now + 1_000);
      expect(second).toMatchObject({ status: "ok", source: "live" });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("新しい検索が失敗したら、旧検索で探す", async () => {
    const now = Date.UTC(2030, 0, 1, 0, 10, 5);
    const { searchOff, hosts } = await withFetch((_term, host) =>
      host === "search.openfoodfacts.org" ? down() : ok([product("4900000000102", "検証用のポテト")]),
    );
    try {
      const r = await searchOff("検証用のポテト", now);
      expect(r).toMatchObject({ status: "ok", products: [{ name: "検証用のポテト" }] });
      expect(hosts).toEqual(["search.openfoodfacts.org", "world.openfoodfacts.org"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("続けて失敗したら少しだけ止め、15 秒後には検索を再開する", async () => {
    const now = Date.UTC(2030, 0, 1, 0, 20, 5);
    let available = false;
    const { searchOff, terms } = await withFetch(() =>
      available ? ok([product("4900000000103", "検証用のおにぎり")]) : down(),
    );
    try {
      expect((await searchOff("検証用のおにぎり", now)).status).toBe("unavailable");
      expect(terms.length).toBe(2);
      expect((await searchOff("検証用のおにぎり", now + 5_000)).status).toBe("unavailable");
      expect(terms.length).toBe(2);
      available = true;
      const r = await searchOff("検証用のおにぎり", now + 16_000);
      expect(r).toMatchObject({ status: "ok", source: "live" });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("料理の写真", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

  it("自分の記録にだけ付けられ、本人だけが取得できる", async () => {
    const photos = await import("@/server/repositories/meal-photos");
    await createUser("photo1", false);
    const id = await m.meals.addMealItem("photo1", item("写真つきの昼食"));
    expect(await photos.setMealPhoto("bob", id, jpeg, "image/jpeg")).toBeNull();
    const saved = await photos.setMealPhoto("photo1", id, jpeg, "image/jpeg");
    expect(saved!.url).toMatch(new RegExp(`^/api/meal-photos/${id}\\?v=\\d+$`));
    expect(await photos.getMealPhoto("bob", id)).toBeNull();
    const got = await photos.getMealPhoto("photo1", id);
    expect(new Uint8Array(got!.data)).toEqual(jpeg);
    expect((await photos.listMealPhotoUrls("photo1", [id])).get(id)).toBe(saved!.url);
    expect(await photos.deleteMealPhoto("bob", id)).toBe(false);
  });

  it("記録を消すと写真も消える", async () => {
    const photos = await import("@/server/repositories/meal-photos");
    const id = await m.meals.addMealItem("photo1", item("消す記録"));
    await photos.setMealPhoto("photo1", id, jpeg, "image/jpeg");
    await m.meals.deleteMealItem("photo1", id);
    expect(await photos.getMealPhoto("photo1", id)).toBeNull();
  });

  it("本登録で写真も引き継ぐ", async () => {
    const photos = await import("@/server/repositories/meal-photos");
    await createUser("photoguest", true);
    const id = await m.meals.addMealItem("photoguest", item("お試し中の夕食"));
    await photos.setMealPhoto("photoguest", id, jpeg, "image/jpeg");
    await createUser("photomember", false);
    await m.account.transferUserData(m.db, "photoguest", "photomember");
    expect(await photos.getMealPhoto("photomember", id)).not.toBeNull();
    expect(await photos.getMealPhoto("photoguest", id)).toBeNull();
  });

  it("画像の種類は中身の先頭バイトで判定する", async () => {
    const { sniffImageType } = await import("@/server/repositories/meal-photos");
    expect(sniffImageType(jpeg)).toBe("image/jpeg");
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe("image/png");
    expect(sniffImageType(new TextEncoder().encode("RIFF0000WEBPVP8 "))).toBe("image/webp");
    expect(sniffImageType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
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

  it("本登録では自分の記録だけを引き継ぎ、サンプルは引き継がない", async () => {
    const sampleItems = await m.meals.listItemsInRange("guest1", "2026-11-01", "2026-11-30");
    expect(sampleItems.every((i) => i.isSample)).toBe(true);
    const sampleRecipes = await m.recipes.listRecipes("guest1");
    expect(sampleRecipes.length).toBeGreaterThan(1);

    // 自分の記録: 新しく記録したもの、サンプルのタグで記録したもの、編集したサンプル
    await m.meals.addMealItem("guest1", item("自分で記録した昼食"));
    const usedRecipe = sampleRecipes[0];
    await m.meals.addMealItem("guest1", {
      ...item("サンプルのタグで記録"),
      date: "2026-11-21",
      mealType: "dinner",
      kind: "home_cooked",
      recipeId: usedRecipe.id,
    });
    const edited = sampleItems[0];
    await m.meals.updateMealItem("guest1", edited.id, { quantity: edited.quantity * 2 });

    await createUser("member1", false);
    await m.account.transferUserData(m.db, "guest1", "member1");

    const moved = await m.meals.listItemsInRange("member1", "2026-11-01", "2026-11-30");
    expect(moved.map((i) => i.nameSnapshot).sort()).toEqual(
      ["自分で記録した昼食", "サンプルのタグで記録", edited.nameSnapshot].sort(),
    );
    expect(moved.every((i) => !i.isSample)).toBe(true);
    // 使ったサンプルのタグだけが残り、利用者のタグになる
    const recipes = await m.recipes.listRecipes("member1");
    expect(recipes.map((r) => r.id)).toEqual([usedRecipe.id]);
    expect(recipes[0].isSample).toBe(false);
    expect(await m.products.listMyProducts("member1")).toHaveLength(0);
    // サンプルのプロフィール・目標は引き継がない(本登録後にプロフィールを入力する)
    expect(await m.db.select().from(m.s.profile).where(eq(m.s.profile.userId, "member1"))).toHaveLength(0);
    expect(await m.db.select().from(m.s.nutritionGoal).where(eq(m.s.nutritionGoal.userId, "member1"))).toHaveLength(0);
    // 中身がサンプルだけだった食事は消える
    const meals = await m.db.select().from(m.s.meal).where(eq(m.s.meal.userId, "guest1"));
    expect(meals).toHaveLength(0);
  });

  it("自分で保存したプロフィールは本登録で引き継ぐ", async () => {
    await createUser("guest4", true);
    await m.guest.seedGuest("guest4", new Date("2026-11-22T03:00:00Z"));
    const [sample] = await m.db.select().from(m.s.profile).where(eq(m.s.profile.userId, "guest4"));
    expect(sample.isSample).toBe(true);
    const input = {
      birthYearMonth: sample.birthYearMonth,
      sex: sample.sex,
      heightCm: sample.heightCm,
      weightKg: sample.weightKg,
      activityLevel: sample.activityLevel,
      lifeStage: sample.lifeStage,
      menstruation: sample.menstruation,
      timezone: sample.timezone,
    };
    const profile = await import("@/server/repositories/profile");
    await profile.upsertProfile("guest4", { ...input, heightCm: 171 });

    await createUser("member4", false);
    await m.account.transferUserData(m.db, "guest4", "member4");
    const [moved] = await m.db.select().from(m.s.profile).where(eq(m.s.profile.userId, "member4"));
    expect(moved).toMatchObject({ heightCm: 171, isSample: false });
  }, 60_000);

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

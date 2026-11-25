/**
 * DB スキーマ(docs/architecture.md §2)
 *
 * - 成分の正規キーは成分表の成分識別子(INFOODS タグ)
 * - 栄養値 JSON は { [nutrientCode]: number | null }。null = 不明
 * - ユーザーデータは user_id を持ち ON DELETE CASCADE
 */
import { sql } from "drizzle-orm";
import { blob, index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import type { NutrientMap } from "@/domain/nutrients/types";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`)
    .$onUpdate(() => new Date());

// ---------------------------------------------------------------------------
// 認証(Better Auth 標準テーブル + anonymous プラグイン)
// ---------------------------------------------------------------------------

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  isAnonymous: integer("is_anonymous", { mode: "boolean" }).default(false),
  /** お試しユーザーの削除予定日時(§8)。本登録ユーザーは null */
  guestExpiresAt: integer("guest_expires_at", { mode: "timestamp_ms" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// ユーザー系
// ---------------------------------------------------------------------------

export const profile = sqliteTable("profile", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  /** "YYYY-MM" */
  birthYearMonth: text("birth_year_month").notNull(),
  sex: text("sex", { enum: ["male", "female"] }).notNull(),
  heightCm: real("height_cm").notNull(),
  weightKg: real("weight_kg").notNull(),
  activityLevel: text("activity_level", { enum: ["I", "II", "III"] }).notNull(),
  lifeStage: text("life_stage", { enum: ["none", "pregnant", "lactating"] })
    .notNull()
    .default("none"),
  /** 鉄の基準値(月経あり/なし)の選択に使う。女性 18〜64 歳のみ意味を持つ */
  menstruation: integer("menstruation", { mode: "boolean" }).notNull().default(false),
  timezone: text("timezone").notNull().default("Asia/Tokyo"),
  /** お試し開始時に入れたサンプル。本登録時に引き継がない。利用者が編集すると false になる */
  isSample: integer("is_sample", { mode: "boolean" }).notNull().default(false),
  updatedAt: updatedAt(),
});

export const nutritionGoal = sqliteTable(
  "nutrition_goal",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    nutrientCode: text("nutrient_code").notNull(),
    target: real("target").notNull(),
    direction: text("direction", { enum: ["at_least", "at_most", "range"] }).notNull(),
    upper: real("upper"),
    source: text("source", { enum: ["auto_dri", "custom"] }).notNull(),
    displayOrder: integer("display_order").notNull().default(0),
    showOnHome: integer("show_on_home", { mode: "boolean" }).notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.userId, t.nutrientCode] })],
);

// ---------------------------------------------------------------------------
// 成分表マスタ(全ユーザー共通・読み取り専用)
// ---------------------------------------------------------------------------

export const datasetVersion = sqliteTable("dataset_version", {
  id: text("id").primaryKey(),
  source: text("source", { enum: ["mext", "off", "dri"] }).notNull(),
  title: text("title").notNull(),
  versionLabel: text("version_label").notNull(),
  publishedOn: text("published_on"),
  errataOn: text("errata_on"),
  fileSha256: text("file_sha256"),
  importedAt: createdAt(),
});

export const nutrient = sqliteTable("nutrient", {
  code: text("code").primaryKey(),
  nameJa: text("name_ja").notNull(),
  unit: text("unit").notNull(),
  category: text("category").notNull(),
  displayOrder: integer("display_order").notNull(),
});

export const mextFood = sqliteTable(
  "mext_food",
  {
    foodNo: text("food_no").primaryKey(),
    indexNo: text("index_no"),
    groupCode: text("group_code").notNull(),
    nameRaw: text("name_raw").notNull(),
    nameDisplay: text("name_display").notNull(),
    searchText: text("search_text").notNull(),
    /** 食品名・別名の読み(ひらがな)。漢字・かなの表記ゆれを吸収する */
    searchReading: text("search_reading").notNull().default(""),
    refuseRate: real("refuse_rate"),
    isCooked: integer("is_cooked", { mode: "boolean" }).notNull().default(false),
    cookingMethodCode: text("cooking_method_code"),
    isDish: integer("is_dish", { mode: "boolean" }).notNull().default(false),
    densityGPerMl: real("density_g_per_ml"),
    /** よく使う食品は検索で上位に出す(data/manual/popular.json) */
    popularity: integer("popularity").notNull().default(0),
    note: text("note"),
    datasetVersionId: text("dataset_version_id").notNull(),
  },
  (t) => [index("mext_food_group_idx").on(t.groupCode)],
);

export const mextFoodNutrient = sqliteTable(
  "mext_food_nutrient",
  {
    foodNo: text("food_no")
      .notNull()
      .references(() => mextFood.foodNo, { onDelete: "cascade" }),
    nutrientCode: text("nutrient_code").notNull(),
    value: real("value"),
    flag: text("flag", {
      enum: ["measured", "estimated", "trace", "est_zero", "missing"],
    }).notNull(),
    rawText: text("raw_text"),
  },
  (t) => [
    primaryKey({ columns: [t.foodNo, t.nutrientCode] }),
    index("mfn_nutrient_value_idx").on(t.nutrientCode, t.value),
  ],
);

export const mextFoodAlias = sqliteTable(
  "mext_food_alias",
  {
    foodNo: text("food_no")
      .notNull()
      .references(() => mextFood.foodNo, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
  },
  (t) => [primaryKey({ columns: [t.foodNo, t.alias] }), index("alias_idx").on(t.alias)],
);

export const cookingMethod = sqliteTable("cooking_method", {
  code: text("code").primaryKey(),
  nameJa: text("name_ja").notNull(),
  mextKeywords: text("mext_keywords", { mode: "json" }).$type<string[]>().notNull(),
  usesOil: integer("uses_oil", { mode: "boolean" }).notNull().default(false),
  displayOrder: integer("display_order").notNull().default(0),
});

export const mextCookedVariant = sqliteTable(
  "mext_cooked_variant",
  {
    rawFoodNo: text("raw_food_no").notNull(),
    cookingMethodCode: text("cooking_method_code").notNull(),
    cookedFoodNo: text("cooked_food_no").notNull(),
    weightChangeRate: real("weight_change_rate").notNull(),
    /** 調理後データに油の吸着が含まれるか(油いため・揚げ等) */
    includesOil: integer("includes_oil", { mode: "boolean" }).notNull().default(false),
    source: text("source").notNull(),
  },
  (t) => [primaryKey({ columns: [t.rawFoodNo, t.cookingMethodCode, t.cookedFoodNo] })],
);

export const cookingCoefficient = sqliteTable(
  "cooking_coefficient",
  {
    cookingMethodCode: text("cooking_method_code").notNull(),
    foodCategory: text("food_category").notNull(),
    weightChangeRate: real("weight_change_rate").notNull(),
    oilAbsorptionPct: real("oil_absorption_pct").notNull().default(0),
    retentionJson: text("retention_json", { mode: "json" }).$type<Record<string, number>>(),
    basis: text("basis").notNull(),
    sampleSize: integer("sample_size").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.cookingMethodCode, t.foodCategory] })],
);

export const driValue = sqliteTable(
  "dri_value",
  {
    id: id(),
    driVersion: text("dri_version").notNull(),
    nutrientCode: text("nutrient_code").notNull(),
    sex: text("sex", { enum: ["male", "female"] }).notNull(),
    ageMin: integer("age_min").notNull(),
    ageMax: integer("age_max").notNull(),
    lifeStage: text("life_stage").notNull().default("none"),
    ear: real("ear"),
    rda: real("rda"),
    ai: real("ai"),
    dgLower: real("dg_lower"),
    dgUpper: real("dg_upper"),
    ul: real("ul"),
    sourceRef: text("source_ref").notNull(),
  },
  (t) => [index("dri_lookup_idx").on(t.nutrientCode, t.sex, t.ageMin)],
);

// ---------------------------------------------------------------------------
// 外食・市販商品
// ---------------------------------------------------------------------------

export const offProductCache = sqliteTable("off_product_cache", {
  offCode: text("off_code").primaryKey(),
  payloadJson: text("payload_json", { mode: "json" }).notNull(),
  normalizedJson: text("normalized_json", { mode: "json" }),
  status: text("status", { enum: ["found", "not_found"] }).notNull(),
  fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull(),
});

export const offSearchCache = sqliteTable("off_search_cache", {
  queryNorm: text("query_norm").primaryKey(),
  codesJson: text("codes_json", { mode: "json" }).$type<string[]>().notNull(),
  fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull(),
});

export const myProduct = sqliteTable(
  "my_product",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    source: text("source", { enum: ["off", "mext", "manual", "label_photo"] }).notNull(),
    externalRef: text("external_ref"),
    name: text("name").notNull(),
    brand: text("brand"),
    basis: text("basis", { enum: ["per_100g", "per_serving"] }).notNull(),
    servingSizeG: real("serving_size_g"),
    servingLabel: text("serving_label"),
    nutrientsJson: text("nutrients_json", { mode: "json" }).$type<NutrientMap>().notNull(),
    imageBlobUrl: text("image_blob_url"),
    isEstimate: integer("is_estimate", { mode: "boolean" }).notNull().default(false),
    useCount: integer("use_count").notNull().default(0),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
    /** お試し開始時に入れたサンプル。本登録時に引き継がない。利用者が編集すると false になる */
    isSample: integer("is_sample", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index("my_product_user_idx").on(t.userId, t.lastUsedAt),
    uniqueIndex("my_product_ext_uq").on(t.userId, t.source, t.externalRef),
  ],
);

// ---------------------------------------------------------------------------
// 自炊(タグ / テンプレート)
// ---------------------------------------------------------------------------

export const recipe = sqliteTable(
  "recipe",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    servings: real("servings").notNull().default(1),
    note: text("note"),
    color: text("color"),
    useCount: integer("use_count").notNull().default(0),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
    /** お試し開始時に入れたサンプル。本登録時に引き継がない。利用者が編集すると false になる */
    isSample: integer("is_sample", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("recipe_user_idx").on(t.userId)],
);

export const recipeIngredient = sqliteTable(
  "recipe_ingredient",
  {
    id: id(),
    recipeId: text("recipe_id")
      .notNull()
      .references(() => recipe.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["ingredient", "oil", "seasoning"] }).notNull(),
    foodNo: text("food_no").notNull(),
    amount: real("amount").notNull(),
    unit: text("unit", { enum: ["g", "ml", "tbsp", "tsp"] }).notNull(),
    grams: real("grams").notNull(),
    weightBasis: text("weight_basis", { enum: ["raw", "purchased", "cooked"] })
      .notNull()
      .default("raw"),
    cookingMethodCode: text("cooking_method_code").notNull().default("raw"),
    /** 油: 使用量を全量摂取したとみなすか(§4.2) */
    consumeAll: integer("consume_all", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("recipe_ingredient_recipe_idx").on(t.recipeId)],
);

// ---------------------------------------------------------------------------
// 食事記録
// ---------------------------------------------------------------------------

export const meal = sqliteTable(
  "meal",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** "YYYY-MM-DD"(ユーザー TZ) */
    eatenOn: text("eaten_on").notNull(),
    mealType: text("meal_type", { enum: ["breakfast", "lunch", "dinner", "snack"] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("meal_user_day_type_uq").on(t.userId, t.eatenOn, t.mealType)],
);

export const mealItem = sqliteTable(
  "meal_item",
  {
    id: id(),
    mealId: text("meal_id")
      .notNull()
      .references(() => meal.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["product", "mext_dish", "home_cooked", "manual"] }).notNull(),
    myProductId: text("my_product_id"),
    recipeId: text("recipe_id"),
    foodNo: text("food_no"),
    nameSnapshot: text("name_snapshot").notNull(),
    quantity: real("quantity").notNull(),
    unit: text("unit").notNull(),
    grams: real("grams"),
    energyKcal: real("energy_kcal"),
    proteinG: real("protein_g"),
    fatG: real("fat_g"),
    carbG: real("carb_g"),
    saltG: real("salt_g"),
    nutrientsJson: text("nutrients_json", { mode: "json" }).$type<NutrientMap>().notNull(),
    calcTraceJson: text("calc_trace_json", { mode: "json" }),
    isEstimate: integer("is_estimate", { mode: "boolean" }).notNull().default(false),
    sourceLabel: text("source_label"),
    datasetVersionId: text("dataset_version_id"),
    /** お試し開始時に入れたサンプル。本登録時に引き継がない。利用者が編集すると false になる */
    isSample: integer("is_sample", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("meal_item_meal_idx").on(t.mealId), index("meal_item_user_idx").on(t.userId)],
);

/** 料理の写真(任意)。記録 1 件に 1 枚。縮小した画像を DB に保存し、本人だけが取得できる */
export const mealPhoto = sqliteTable(
  "meal_photo",
  {
    mealItemId: text("meal_item_id")
      .primaryKey()
      .references(() => mealItem.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    contentType: text("content_type").notNull(),
    data: blob("data", { mode: "buffer" }).notNull(),
    byteSize: integer("byte_size").notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [index("meal_photo_user_idx").on(t.userId)],
);

export const dayStatus = sqliteTable(
  "day_status",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    isComplete: integer("is_complete", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date] })],
);

// ---------------------------------------------------------------------------
// 運用
// ---------------------------------------------------------------------------

export const rateLimitBucket = sqliteTable("rate_limit_bucket", {
  key: text("key").primaryKey(),
  windowStart: integer("window_start", { mode: "timestamp_ms" }).notNull(),
  count: integer("count").notNull(),
});

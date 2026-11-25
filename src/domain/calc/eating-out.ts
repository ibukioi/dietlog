/**
 * 外食を材料から推定する(成分表に料理がないとき)
 *
 * 外食では食材ごとの重さが分からないので、
 *   ① 料理の種類と大きさ → 1 人前の「具・おかず部分」の重さ(本アプリの推計値)
 *   ② 食材ごとの多さ(メイン 4 : たっぷり 2 : 少し 1)で ① を按分
 *   ③ ごはん・麺など重さで指定した食材は按分せず、その重さのまま
 *   ④ 調理法は料理全体で 1 つ。「外食の味付け」を入れると塩(と炒め物の油)を足す
 * として、自炊と同じ計算(calcRecipe)に渡す食材リストを作る。
 * 按分した重さは「調理後(盛り付けた状態)」の重さとして扱い、重量変化率で生重量に戻す。
 *
 * 値はすべて推計値で、誤差は ±20〜30% 程度を見込む。
 */
import type { CookingMethodCode } from "@/domain/mext/cooking";

/** 記録の出典表示。一覧ではこのラベルの記録に「推定値」を付ける */
export const EATING_OUT_LABEL = "外食(材料から推定)";

export const DISH_TYPES = [
  {
    code: "teishoku",
    label: "定食のおかず",
    hint: "生姜焼き・焼き魚・とんかつなど。ごはんは食材として追加すると一緒に計算します",
    grams: { small: 120, regular: 180, large: 250 },
    saltG: 2.0,
    stapleG: 150,
  },
  {
    code: "donburi",
    label: "丼もの",
    hint: "大きさはごはんの上の具の量。ごはんは食材として追加して重さで指定",
    grams: { small: 120, regular: 170, large: 230 },
    saltG: 2.5,
    stapleG: 250,
  },
  {
    code: "noodle",
    label: "麺類",
    hint: "大きさは麺の上の具の量。麺は食材として追加して重さで指定。塩はスープを半分飲む前提",
    grams: { small: 60, regular: 100, large: 150 },
    saltG: 4.0,
    stapleG: 220,
  },
  {
    code: "plate",
    label: "カレー・パスタ・チャーハン",
    hint: "大きさはソース・具の量。ごはん・パスタは食材として追加して重さで指定",
    grams: { small: 150, regular: 220, large: 300 },
    saltG: 2.5,
    stapleG: 250,
  },
  {
    code: "single",
    label: "単品のおかず",
    hint: "居酒屋の一品・中華のおかずなど",
    grams: { small: 100, regular: 150, large: 220 },
    saltG: 1.5,
    stapleG: 150,
  },
  {
    code: "side",
    label: "小鉢・副菜",
    hint: "おひたし・サラダ・煮物の小鉢など",
    grams: { small: 50, regular: 80, large: 120 },
    saltG: 0.8,
    stapleG: 150,
  },
] as const;

export type DishTypeCode = (typeof DISH_TYPES)[number]["code"];
export type PortionSize = "small" | "regular" | "large";

export const PORTION_SIZE_LABEL: Record<PortionSize, string> = {
  small: "少なめ",
  regular: "普通",
  large: "大盛り",
};

/** 塩・油は料理の大きさに合わせて増減する */
const SIZE_FACTOR: Record<PortionSize, number> = { small: 0.75, regular: 1, large: 1.35 };

export type Share = "main" | "plenty" | "little";
export const SHARE_WEIGHT: Record<Share, number> = { main: 4, plenty: 2, little: 1 };
export const SHARE_LABEL: Record<Share, string> = { main: "メイン", plenty: "たっぷり", little: "少し" };

/** ごはん・麺の重さのショートカット(盛り付けた状態のg) */
export const STAPLE_PRESETS = [
  { label: "茶碗に軽く", grams: 100 },
  { label: "茶碗1杯", grams: 150 },
  { label: "丼・大盛り", grams: 250 },
  { label: "麺1玉(ゆで)", grams: 220 },
  { label: "麺大盛り", grams: 330 },
] as const;

/** 炒め物の外食は家庭より油が多い前提で、吸油量の推定に上乗せする(普通盛り) */
export const EXTRA_SAUTE_OIL_G = 5;

export const FOOD_NO = { salt: "17012", oil: "14006" } as const;

export interface EstimateRow {
  foodNo: string;
  /** 割合で指定(grams が null のとき使う) */
  share: Share;
  /** 重さで指定した場合(盛り付けた状態の g) */
  grams: number | null;
  /** 盛り付けたままの重さで計算する食品(ごはん・調理済みの食品)。調理法を適用しない */
  servedAsIs: boolean;
}

export interface EstimateInput {
  dishType: DishTypeCode;
  size: PortionSize;
  method: CookingMethodCode;
  rows: EstimateRow[];
  /** 外食の味付け(塩・炒め物の油)を足す */
  addSeasoning: boolean;
}

export interface EstimatedSpec {
  role: "ingredient" | "seasoning";
  foodNo: string;
  amount: number;
  unit: "g";
  weightBasis: "raw" | "cooked";
  method: CookingMethodCode;
  consumeAll: boolean;
}

/** ごはん・麺を追加したときの最初の重さ(料理の種類ごと。麺は 1 玉) */
export function defaultStapleGrams(code: DishTypeCode, isNoodle: boolean): number {
  return isNoodle ? 220 : dishType(code).stapleG;
}

export function dishType(code: DishTypeCode) {
  return DISH_TYPES.find((d) => d.code === code)!;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** 割合で指定した食材の重さ(g)。重さで指定した食材はそのまま */
export function allocateGrams(input: Pick<EstimateInput, "dishType" | "size" | "rows">): number[] {
  const total = dishType(input.dishType).grams[input.size];
  const weightSum = input.rows.reduce((s, r) => s + (r.grams === null ? SHARE_WEIGHT[r.share] : 0), 0);
  return input.rows.map((r) => {
    if (r.grams !== null) return r.grams;
    return weightSum > 0 ? round1((total * SHARE_WEIGHT[r.share]) / weightSum) : 0;
  });
}

/** 自炊の計算(1 人前・1 人前食べた)に渡す食材リスト */
export function buildEstimateSpecs(input: EstimateInput): EstimatedSpec[] {
  const grams = allocateGrams(input);
  const specs: EstimatedSpec[] = input.rows
    .map((r, i) => ({
      role: "ingredient" as const,
      foodNo: r.foodNo,
      amount: grams[i],
      unit: "g" as const,
      // 盛り付けた状態の重さなので、調理する食材は調理後の重さとして生重量に戻す
      weightBasis: r.servedAsIs || input.method === "raw" ? ("raw" as const) : ("cooked" as const),
      method: r.servedAsIs ? ("raw" as const) : input.method,
      consumeAll: false,
    }))
    .filter((s) => s.amount > 0);

  if (input.addSeasoning && specs.length > 0) {
    const f = SIZE_FACTOR[input.size];
    specs.push({
      role: "seasoning",
      foodNo: FOOD_NO.salt,
      amount: round1(dishType(input.dishType).saltG * f),
      unit: "g",
      weightBasis: "raw",
      method: "raw",
      consumeAll: false,
    });
    // 油の欄に入れると吸油量の推定(油の指定がないときの既定油)が働かなくなるので、
    // 上乗せ分は調味料として全量を加算する
    if (input.method === "saute") {
      specs.push({
        role: "seasoning",
        foodNo: FOOD_NO.oil,
        amount: round1(EXTRA_SAUTE_OIL_G * f),
        unit: "g",
        weightBasis: "raw",
        method: "raw",
        consumeAll: false,
      });
    }
  }
  return specs;
}

/** ごはん・おかゆなど、盛り付けた状態の成分値が成分表にある食品か */
export function isServedAsIs(food: { nameDisplay: string; isCooked: boolean; isDish: boolean }): boolean {
  return food.isCooked || food.isDish || /めし|かゆ|おにぎり|ごはん/.test(food.nameDisplay);
}

/** ごはん・麺(重さで指定するのが自然な主食)か */
export function isStaple(food: { groupCode: string }): boolean {
  return food.groupCode === "01";
}

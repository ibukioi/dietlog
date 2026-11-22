/**
 * 1日の目標の自動算出と HP ゲージの状態判定(§3.4)
 */
import { type ActivityLevel, type Sex, driFor, estimatedEnergyRequirement, pfcTargets } from "@/domain/dri/dri";
import type { NutrientTotal } from "@/domain/nutrients/types";

export type GoalDirection = "at_least" | "at_most" | "range";

export interface Goal {
  nutrientCode: string;
  target: number;
  direction: GoalDirection;
  /** range のときの上限 */
  upper: number | null;
  showOnHome: boolean;
  displayOrder: number;
}

export interface ProfileForGoals {
  age: number;
  sex: Sex;
  weightKg: number;
  activityLevel: ActivityLevel;
  menstruation?: boolean;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** プロフィールと食事摂取基準(2025年版)から目標の初期値を作る */
export function defaultGoals(p: ProfileForGoals): Goal[] {
  const goals: Goal[] = [];
  const eer = estimatedEnergyRequirement(p) ?? 2000;
  const pfc = pfcTargets(p.age);
  let order = 0;
  const push = (g: Omit<Goal, "displayOrder">) => goals.push({ ...g, displayOrder: order++ });

  push({ nutrientCode: "ENERC_KCAL", target: eer, direction: "at_most", upper: null, showOnHome: true });

  const protRda = driFor("PROT-", p)?.rda;
  const protFromPct = (eer * pfc.proteinPct[0]) / 100 / 4;
  push({
    nutrientCode: "PROT-",
    target: Math.round(Math.max(protRda ?? 0, protFromPct)),
    direction: "at_least",
    upper: null,
    showOnHome: true,
  });
  push({
    nutrientCode: "FAT-",
    target: Math.round((eer * pfc.fatPct[0]) / 100 / 9),
    direction: "range",
    upper: Math.round((eer * pfc.fatPct[1]) / 100 / 9),
    showOnHome: true,
  });
  push({
    nutrientCode: "CHOCDF-",
    target: Math.round((eer * pfc.carbPct[0]) / 100 / 4),
    direction: "range",
    upper: Math.round((eer * pfc.carbPct[1]) / 100 / 4),
    showOnHome: true,
  });
  const salt = driFor("NACL_EQ", p)?.dgUpper;
  push({ nutrientCode: "NACL_EQ", target: salt ?? 7, direction: "at_most", upper: null, showOnHome: true });
  const fiber = driFor("FIB-", p)?.dgLower;
  push({ nutrientCode: "FIB-", target: fiber ?? 18, direction: "at_least", upper: null, showOnHome: true });

  // ホームには出さない(設定で ON にできる)ミネラル・ビタミン
  for (const code of ["CA", "FE", "VITC", "VITD", "THIA", "RIBF", "VITA_RAE", "K", "MG", "ZN"]) {
    const d = driFor(code, p);
    const t = d?.rda ?? d?.ai;
    if (t) push({ nutrientCode: code, target: round1(t), direction: "at_least", upper: null, showOnHome: false });
  }
  return goals;
}

export type GaugeStatus = "empty" | "low" | "ok" | "full" | "warn" | "over";

export interface GaugeState {
  nutrientCode: string;
  intake: number;
  target: number;
  upper: number | null;
  direction: GoalDirection;
  /** 目標に対する割合(0〜) */
  ratio: number;
  status: GaugeStatus;
  /** 目標(at_most/range は上限)を超えた量 */
  overBy: number;
  /** 不明データを含む項目がある */
  hasUnknown: boolean;
}

/**
 * ゲージ状態
 *  at_least: 100% で満タン(full)
 *  at_most : 80% 以上で warn、100% 超で over
 *  range   : 下限未満は low、範囲内は ok、上限超で over
 */
export function gaugeState(goal: Goal, total: NutrientTotal): GaugeState {
  const intake = total.sum;
  const limit = goal.direction === "range" ? (goal.upper ?? goal.target) : goal.target;
  const ratio = goal.target > 0 ? intake / goal.target : 0;
  let status: GaugeStatus;
  if (intake <= 0) status = "empty";
  else if (goal.direction === "at_least") status = ratio >= 1 ? "full" : "low";
  else if (goal.direction === "at_most") status = intake > limit ? "over" : ratio >= 0.8 ? "warn" : "ok";
  else status = intake > limit ? "over" : intake >= goal.target ? "ok" : "low";

  return {
    nutrientCode: goal.nutrientCode,
    intake,
    target: goal.target,
    upper: goal.upper,
    direction: goal.direction,
    ratio,
    status,
    overBy: goal.direction === "at_least" ? 0 : Math.max(0, intake - limit),
    hasUnknown: total.unknownItems > 0,
  };
}

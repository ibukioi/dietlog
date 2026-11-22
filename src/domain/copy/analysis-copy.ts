/**
 * 栄養バランス分析の表示文言(§9)。
 * 表現は「食事摂取基準と比較した参考情報」にとどめる。
 * 禁止語(診断・効能を連想させる語)は analysis-copy.test.ts で機械的にチェックする。
 */
import type { Verdict } from "@/domain/analysis/analyze";

export const VERDICT_LABEL: Record<Verdict, string> = {
  deficient: "不足傾向",
  slightly_low: "やや少なめ",
  adequate: "基準を満たしている",
  below_ai: "目安量を下回っている",
  below_dg: "目標量に届いていない",
  above_dg: "目標量を超えている",
  insufficient_data: "データ不足で判定不可",
};

export const VERDICT_DESCRIPTION: Record<Verdict, string> = {
  deficient: "直近の平均が推定平均必要量を下回っています。",
  slightly_low: "直近の平均が推定平均必要量以上ですが、推奨量には届いていません。",
  adequate: "直近の平均が基準値に達しています。",
  below_ai: "目安量は「不足とは言えない量」の目安です。下回っていても不足かどうかは判断できません。",
  below_dg: "生活習慣病の予防を目的とした目標量に届いていません。",
  above_dg: "生活習慣病の予防を目的とした目標量を超えています。",
  insufficient_data:
    "この成分の記載がない食品(市販品・手入力の外食など)が多いため、判定していません。自炊や料理・惣菜の記録が増えると判定できるようになります。",
};

export const DISCLAIMER =
  "本機能は、日本人の食事摂取基準(2025年版)と記録内容を比較した参考情報です。診断・治療を目的としたものではなく、医療に代わるものではありません。体調に不安がある方、治療中・妊娠中の方は医師・管理栄養士にご相談ください。";

export const LIMITATION =
  "7日間の平均は、ふだんの摂取量のおおまかな目安です。記録の漏れや、成分表の標準的な値と実際の食品との違いによって、結果は変わります。";

export const PENDING_MESSAGE = (remaining: number) =>
  `分析には直近7日のうち5日以上の記録が必要です。あと ${remaining} 日分記録すると、栄養バランスを表示できます。`;

export const EXCLUDED_MESSAGE = {
  under18: "18歳未満の方は、この分析の対象外です(基準値が成人と異なるため)。",
  pregnant: "妊娠中の方は、この分析の対象外です。栄養については医師・管理栄養士にご相談ください。",
  lactating: "授乳中の方は、この分析の対象外です。栄養については医師・管理栄養士にご相談ください。",
} as const;

export const TIPS_HEADING = "食事から摂る工夫";
export const TIPS_LEAD = "日本食品標準成分表で、この成分を多く含む食品の例(可食部100 gあたり)";

/** 診断・治療・効能を断定する表現として使わない語(§9) */
export const BANNED_WORDS = [
  "改善",
  "予防できる",
  "治る",
  "治す",
  "効く",
  "効果",
  "効能",
  "補って健康",
  "欠乏症",
  "栄養失調",
  "診断します",
];

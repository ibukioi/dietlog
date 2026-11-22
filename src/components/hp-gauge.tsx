import { nutrientDef, nutrientLabel } from "@/domain/nutrients/catalog";
import type { GaugeState } from "@/domain/goals/goals";
import { cn } from "@/lib/utils";

const COLOR: Record<string, string> = {
  ENERC_KCAL: "var(--g-energy)",
  "PROT-": "var(--g-protein)",
  "FAT-": "var(--g-fat)",
  "CHOCDF-": "var(--g-carb)",
  NACL_EQ: "var(--g-salt)",
  "FIB-": "var(--g-fiber)",
};

export function formatAmount(value: number, unit: string): string {
  const digits = unit === "kcal" || value >= 100 ? 0 : value >= 10 ? 1 : value >= 1 ? 1 : 2;
  return value.toLocaleString("ja-JP", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function statusText(g: GaugeState, unit: string): string {
  switch (g.status) {
    case "over":
      return `+${formatAmount(g.overBy, unit)} ${unit} オーバー`;
    case "full":
      return "目標達成";
    case "warn":
      return "上限に近づいています";
    case "ok":
      return g.direction === "range" ? "目標の範囲内" : "";
    case "low":
      return g.direction === "range" ? "目標の下限まであと少し" : "";
    default:
      return "";
  }
}

export function HpGauge({ gauge, variant = "row" }: { gauge: GaugeState; variant?: "hero" | "row" }) {
  const def = nutrientDef(gauge.nutrientCode);
  const unit = def.unit;
  const base = COLOR[gauge.nutrientCode] ?? "var(--g-other)";
  const color = gauge.status === "warn" ? "var(--g-warn)" : base;
  // バーの最大は目標(range は上限)。超えた場合はバー全体を摂取量に合わせて縮め、
  // 目標の位置に目盛りを立て、超過分を赤で示す
  const max = gauge.direction === "range" ? (gauge.upper ?? gauge.target) : gauge.target;
  const over = gauge.direction !== "at_least" && gauge.intake > max;
  const scaleMax = over ? gauge.intake : max;
  const pct = scaleMax > 0 ? Math.min(100, (Math.min(gauge.intake, max) / scaleMax) * 100) : 0;
  const overPct = over ? 100 - pct : 0;
  const limitPct = over ? pct : null;
  const rangeLowPct = gauge.direction === "range" && gauge.upper ? (gauge.target / scaleMax) * 100 : null;
  const label = nutrientLabel(gauge.nutrientCode);
  const targetText =
    gauge.direction === "range"
      ? `${formatAmount(gauge.target, unit)}〜${formatAmount(gauge.upper ?? gauge.target, unit)}`
      : `${gauge.direction === "at_most" ? "〜" : ""}${formatAmount(gauge.target, unit)}${gauge.direction === "at_least" ? "〜" : ""}`;
  const note = statusText(gauge, unit);
  const hero = variant === "hero";

  const track = (
    <div
      className={cn("hp-track", hero && "hp-lg")}
      role="progressbar"
      aria-label={`${label}の摂取量`}
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(gauge.intake)}
      aria-valuetext={`${formatAmount(gauge.intake, unit)}${unit}(目標 ${targetText}${unit})${note ? `、${note}` : ""}${gauge.hasUnknown ? "、一部データなし" : ""}`}
    >
      <div
        className={cn("hp-fill", gauge.hasUnknown && "hp-unknown", over && "rounded-r-none")}
        style={{ width: `${pct}%`, background: color }}
      />
      {rangeLowPct !== null && (
        <div
          aria-hidden
          className="absolute inset-y-[-3px] w-px bg-[var(--ink)]/40"
          style={{ left: `${rangeLowPct}%` }}
        />
      )}
      {overPct > 0 && (
        <div
          aria-hidden
          className="hp-over absolute inset-y-0 rounded-r-full"
          style={{ left: `${pct}%`, width: `${overPct}%` }}
        />
      )}
      {limitPct !== null && (
        <div
          aria-hidden
          className="absolute inset-y-[-4px] w-0.5 -translate-x-1/2 rounded-full bg-[var(--ink)]"
          style={{ left: `${limitPct}%` }}
        />
      )}
    </div>
  );

  const footer = (note || gauge.hasUnknown) && (
    <div className="flex justify-between gap-2 text-xs text-muted-foreground">
      <span className={cn(gauge.status === "over" && "font-medium text-[var(--g-over)]")}>{note}</span>
      {gauge.hasUnknown && <span>一部データなし(斜線)</span>}
    </div>
  );

  if (hero) {
    return (
      <div className="grid gap-3">
        <div className="flex items-end justify-between gap-3">
          <div className="grid gap-1">
            <span className="text-sm text-muted-foreground">{label}</span>
            <span
              className={cn(
                "font-num text-5xl leading-none font-light tracking-tight tabular-nums",
                gauge.status === "over" && "text-[var(--g-over)]",
              )}
            >
              {formatAmount(gauge.intake, unit)}
              <span className="ml-1 text-lg font-normal text-muted-foreground">{unit}</span>
            </span>
          </div>
          <span className="pb-1 font-num text-sm text-muted-foreground tabular-nums">
            目標 {targetText} {unit}
          </span>
        </div>
        {track}
        {footer}
      </div>
    );
  }

  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-2 text-sm">
          <span aria-hidden className="size-2 rounded-full" style={{ background: base }} />
          {label}
        </span>
        <span className="font-num text-sm tabular-nums">
          <span className={cn("text-base font-medium", gauge.status === "over" && "text-[var(--g-over)]")}>
            {formatAmount(gauge.intake, unit)}
          </span>
          <span className="text-muted-foreground">
            {" "}
            / {targetText} {unit}
          </span>
        </span>
      </div>
      {track}
      {footer}
    </div>
  );
}

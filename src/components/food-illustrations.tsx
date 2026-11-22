/**
 * 食べ物のイラスト(オリジナルの SVG)。
 * 紺の細い線 + 淡い色の面で、水色基調の画面になじむようにしている。装飾なので aria-hidden。
 */
import { cn } from "@/lib/utils";

const INK = "#0e2a3b";
const SW = 1.8;

type P = { className?: string };

function Svg({ className, children, viewBox = "0 0 64 64" }: P & { children: React.ReactNode; viewBox?: string }) {
  return (
    <svg
      viewBox={viewBox}
      aria-hidden
      focusable="false"
      className={cn("shrink-0", className)}
      fill="none"
      stroke={INK}
      strokeWidth={SW}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** ごはん茶碗 */
export function RiceBowl({ className }: P) {
  return (
    <Svg className={className}>
      <path d="M14 30c0-7 8-12 18-12s18 5 18 12" fill="#ffffff" />
      <circle cx="24" cy="24" r="1" fill={INK} stroke="none" />
      <circle cx="31" cy="21" r="1" fill={INK} stroke="none" />
      <circle cx="38" cy="25" r="1" fill={INK} stroke="none" />
      <path d="M10 30h44c0 11-9 18-22 18S10 41 10 30Z" fill="#cfe6f6" />
      <path d="M17 36c3 3 7 5 11 5" stroke="#ffffff" strokeWidth={2.2} />
      <path d="M25 48l1 5h12l1-5" fill="#cfe6f6" />
    </Svg>
  );
}

/** おにぎり */
export function Onigiri({ className }: P) {
  return (
    <Svg className={className}>
      <path d="M32 10c4 0 7 3 10 8l9 15c4 8-1 17-10 17H23c-9 0-14-9-10-17l9-15c3-5 6-8 10-8Z" fill="#ffffff" />
      <path d="M22 50V38c0-2 1-3 3-3h14c2 0 3 1 3 3v12" fill="#2b4a3b" stroke={INK} />
      <circle cx="27" cy="29" r="1.2" fill={INK} stroke="none" />
      <circle cx="37" cy="29" r="1.2" fill={INK} stroke="none" />
      <path d="M30 32c1 1 3 1 4 0" />
      <circle cx="23" cy="32" r="2" fill="#f7b6b3" stroke="none" />
      <circle cx="41" cy="32" r="2" fill="#f7b6b3" stroke="none" />
    </Svg>
  );
}

/** 目玉焼き */
export function Egg({ className }: P) {
  return (
    <Svg className={className}>
      <path
        d="M14 34c-3-9 4-18 13-17 4-6 15-6 19 1 8 1 11 10 7 17-2 8-10 12-17 10-6 4-16 3-19-3-4-1-5-5-3-8Z"
        fill="#ffffff"
      />
      <circle cx="33" cy="33" r="8" fill="#f6c453" />
      <path d="M29 30c1-2 3-3 5-3" stroke="#ffffff" strokeWidth={2} />
    </Svg>
  );
}

/** トマト */
export function Tomato({ className }: P) {
  return (
    <Svg className={className}>
      <circle cx="32" cy="36" r="17" fill="#f08a7a" />
      <path d="M24 22c3 2 5 3 8 3s5-1 8-3M32 25v-8M26 19l6 3 6-3" stroke="#3d8b5a" />
      <path d="M22 34c0-4 3-7 6-8" stroke="#ffffff" strokeWidth={2.2} />
    </Svg>
  );
}

/** 焼き魚 */
export function Fish({ className }: P) {
  return (
    <Svg className={className} viewBox="0 0 72 48">
      <path d="M8 24c8-11 22-15 36-11 6 2 10 5 14 9l8-7v20l-8-7c-4 4-8 7-14 9-14 4-28 0-36-13Z" fill="#a9d3ef" />
      <circle cx="18" cy="22" r="1.6" fill={INK} stroke="none" />
      <path d="M28 16c3 5 3 11 0 16M36 15c2 6 2 12 0 18" />
      <path d="M14 27c2 1 4 1 6 0" />
    </Svg>
  );
}

/** ブロッコリー */
export function Broccoli({ className }: P) {
  return (
    <Svg className={className}>
      <path d="M28 36l-3 16h14l-3-16" fill="#cfe9c9" />
      <path d="M18 32a8 8 0 0 1 4-14 9 9 0 0 1 17-3 8 8 0 0 1 9 11 7 7 0 0 1-4 11H23a6 6 0 0 1-5-5Z" fill="#7cc58a" />
      <circle cx="27" cy="25" r="1" fill={INK} stroke="none" />
      <circle cx="36" cy="22" r="1" fill={INK} stroke="none" />
      <circle cx="40" cy="30" r="1" fill={INK} stroke="none" />
    </Svg>
  );
}

/** お茶(湯のみ) */
export function TeaCup({ className }: P) {
  return (
    <Svg className={className}>
      <path d="M26 14c-2 3 2 5 0 8M34 12c-2 3 2 5 0 8" stroke="#8cc3e6" />
      <path d="M16 26h32l-3 20c-1 4-4 6-8 6H27c-4 0-7-2-8-6l-3-20Z" fill="#ffffff" />
      <path d="M18 34h28" stroke="#8cc3e6" />
      <path d="M19 38c3 4 9 6 13 6" stroke="#cfe6f6" strokeWidth={2.4} />
    </Svg>
  );
}

/** 食事区分ごとの小さなアイコン */
export function MealIcon({ mealType, className }: P & { mealType: "breakfast" | "lunch" | "dinner" | "snack" }) {
  const C = { breakfast: Egg, lunch: Onigiri, dinner: RiceBowl, snack: TeaCup }[mealType];
  return <C className={className} />;
}

/** 空の状態に添えるイラスト(おにぎりと湯のみ) */
export function EmptyIllustration({ className }: P) {
  return (
    <div className={cn("flex items-end gap-1", className)} aria-hidden>
      <Onigiri className="size-10" />
      <TeaCup className="size-8" />
    </div>
  );
}

"use client";

import { useActionState, useState } from "react";

import { type ProfileFormState, saveProfileAction } from "@/app/(app)/settings/actions";
import { Field, NativeSelect } from "@/components/form-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface ProfileValues {
  birthYearMonth: string;
  sex: "male" | "female" | "";
  heightCm: number | "";
  weightKg: number | "";
  activityLevel: "I" | "II" | "III" | "";
  lifeStage: "none" | "pregnant" | "lactating";
  menstruation: boolean;
}

const ACTIVITY = [
  { v: "I", label: "低い", hint: "生活の大部分が座位で、静的な活動が中心" },
  { v: "II", label: "ふつう", hint: "座位中心だが、通勤・家事・軽いスポーツなどを含む" },
  { v: "III", label: "高い", hint: "立ち仕事・移動が多い、または活発な運動習慣がある" },
];

export function ProfileForm({ initial, mode }: { initial: ProfileValues; mode: "settings" | "onboarding" }) {
  const [state, action, pending] = useActionState<ProfileFormState, FormData>(saveProfileAction, {});
  const [sex, setSex] = useState(initial.sex);
  const [height, setHeight] = useState(String(initial.heightCm));
  const [weight, setWeight] = useState(String(initial.weightKg));
  const bmi = Number(height) > 0 && Number(weight) > 0 ? Number(weight) / (Number(height) / 100) ** 2 : null;

  return (
    <form action={action} className="grid gap-5">
      <input type="hidden" name="from" value={mode} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="生年月" htmlFor="p-birth" hint="年齢区分の判定に使います(日は保存しません)">
          <Input id="p-birth" name="birthYearMonth" type="month" defaultValue={initial.birthYearMonth} required />
        </Field>
        <Field label="性別" htmlFor="p-sex" hint="食事摂取基準の値は性別ごとに定められています">
          <NativeSelect
            id="p-sex"
            name="sex"
            value={sex}
            onChange={(e) => setSex(e.target.value as ProfileValues["sex"])}
            required
          >
            <option value="" disabled>
              選んでください
            </option>
            <option value="female">女性</option>
            <option value="male">男性</option>
          </NativeSelect>
        </Field>
        <Field label="身長(cm)" htmlFor="p-h">
          <Input
            id="p-h"
            name="heightCm"
            inputMode="decimal"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            required
          />
        </Field>
        <Field
          label="体重(kg)"
          htmlFor="p-w"
          hint={bmi ? `BMI ${bmi.toFixed(1)}(参考)` : "推定エネルギー必要量の計算に使います"}
        >
          <Input
            id="p-w"
            name="weightKg"
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            required
          />
        </Field>
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">身体活動レベル</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {ACTIVITY.map((a) => (
            <label
              key={a.v}
              className="flex cursor-pointer gap-2 rounded-lg border border-border bg-white p-3 has-[:checked]:border-[var(--brand)] has-[:checked]:bg-[var(--brand-soft)]"
            >
              <input
                type="radio"
                name="activityLevel"
                value={a.v}
                defaultChecked={initial.activityLevel === a.v}
                required
                className="mt-1 accent-[var(--brand)]"
              />
              <span>
                <span className="block text-sm font-medium">{a.label}</span>
                <span className="block text-xs text-muted-foreground">{a.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {sex === "female" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="妊娠・授乳" htmlFor="p-life" hint="妊娠中・授乳中は栄養バランスの判定を行いません">
            <NativeSelect id="p-life" name="lifeStage" defaultValue={initial.lifeStage}>
              <option value="none">該当なし</option>
              <option value="pregnant">妊娠中</option>
              <option value="lactating">授乳中</option>
            </NativeSelect>
          </Field>
          <label className="flex items-start gap-2 self-end pb-2 text-sm">
            <input
              type="checkbox"
              name="menstruation"
              defaultChecked={initial.menstruation}
              className="mt-0.5 accent-[var(--brand)]"
            />
            <span>
              月経がある
              <span className="block text-xs text-muted-foreground">鉄の基準値(月経あり/なし)の選択に使います</span>
            </span>
          </label>
        </div>
      )}

      {mode === "settings" && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="recalcGoals" className="accent-[var(--brand)]" />
          1日の目標をプロフィールから計算し直す(自分で変えた目標は初期値に戻ります)
        </label>
      )}

      <p className="text-xs text-muted-foreground">
        入力した内容は、目標値の計算・BMI の参考表示・栄養バランスの判定にだけ使います。
      </p>

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "保存しています…" : mode === "onboarding" ? "保存して始める" : "保存する"}
        </Button>
        {state.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
        {state.ok && <p className="text-sm text-[var(--brand)]">保存しました</p>}
      </div>
    </form>
  );
}

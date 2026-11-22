"use client";

import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";

import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

export interface HistoryPoint {
  label: string;
  kcal: number;
  protein: number;
  fat: number;
  carb: number;
}

const config = {
  kcal: { label: "エネルギー(kcal)", color: "var(--g-energy)" },
  protein: { label: "たんぱく質(g)", color: "var(--g-protein)" },
  fat: { label: "脂質(g)", color: "var(--g-fat)" },
  carb: { label: "炭水化物(g)", color: "var(--g-carb)" },
} satisfies ChartConfig;

export function EnergyChart({ data, target, title }: { data: HistoryPoint[]; target: number | null; title: string }) {
  return (
    <figure className="grid gap-2">
      <figcaption className="text-sm font-bold">{title}</figcaption>
      <ChartContainer config={config} className="aspect-auto h-56 w-full">
        <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
          <YAxis
            width={40}
            tickLine={false}
            axisLine={false}
            fontSize={11}
            domain={[0, (dataMax: number) => Math.ceil(Math.max(dataMax, (target ?? 0) * 1.08) / 100) * 100]}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          {target && (
            <ReferenceLine
              y={target}
              stroke="var(--ink)"
              strokeDasharray="4 3"
              label={{ value: "目標", position: "insideTopRight", fontSize: 11 }}
            />
          )}
          <Bar dataKey="kcal" fill="var(--color-kcal)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ChartContainer>
    </figure>
  );
}

export function PfcChart({ data, title }: { data: HistoryPoint[]; title: string }) {
  return (
    <figure className="grid gap-2">
      <figcaption className="text-sm font-bold">{title}</figcaption>
      <ChartContainer config={config} className="aspect-auto h-56 w-full">
        <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
          <YAxis width={40} tickLine={false} axisLine={false} fontSize={11} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="protein" stackId="a" fill="var(--color-protein)" />
          <Bar dataKey="fat" stackId="a" fill="var(--color-fat)" />
          <Bar dataKey="carb" stackId="a" fill="var(--color-carb)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ChartContainer>
    </figure>
  );
}

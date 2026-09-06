"use client";

import { DateTime } from "luxon";
import { useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartDay } from "@/lib/insights";

function formatTick(dateStr: string): string {
  return DateTime.fromISO(dateStr).toFormat("M/d");
}

function formatCalories(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${value}`;
}

function TooltipContent({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; dataKey: string }[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const consumed = payload.find((p) => p.dataKey === "consumed")?.value ?? 0;
  const target = payload.find((p) => p.dataKey === "target")?.value ?? 0;
  return (
    <div className="rounded border border-white/20 bg-[var(--background)] px-2 py-1 text-xs shadow">
      <p className="font-medium">
        {label ? DateTime.fromISO(label).toFormat("EEE, MMM d") : ""}
      </p>
      <p>{consumed} kcal consumed</p>
      <p className="text-[var(--foreground)]/60">{target} kcal target</p>
    </div>
  );
}

function Chart({ days }: { days: ChartDay[] }) {
  const tickInterval = days.length > 14 ? Math.ceil(days.length / 7) : 0;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart
        data={days}
        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
        <XAxis
          dataKey="date"
          tickFormatter={formatTick}
          interval={tickInterval}
          tick={{ fontSize: 11 }}
          stroke="rgba(255,255,255,0.4)"
        />
        <YAxis
          tickFormatter={formatCalories}
          tick={{ fontSize: 11 }}
          stroke="rgba(255,255,255,0.4)"
          width={34}
        />
        <Tooltip content={<TooltipContent />} />
        <Bar
          dataKey="consumed"
          fill="rgba(255,255,255,0.5)"
          radius={[2, 2, 0, 0]}
          isAnimationActive={false}
        />
        <Line
          dataKey="target"
          stroke="#f0b429"
          strokeWidth={2}
          strokeDasharray="4 3"
          dot={false}
          activeDot={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function InsightsCharts({
  window7,
  window30,
}: {
  window7: ChartDay[];
  window30: ChartDay[];
}) {
  const [range, setRange] = useState<"7" | "30">("7");
  const days = range === "7" ? window7 : window30;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-white/10 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Calories vs. target</span>
        <div className="flex gap-1 text-xs">
          <button
            type="button"
            onClick={() => setRange("7")}
            className={`rounded px-2 py-1 ${
              range === "7" ? "bg-white/20" : "text-[var(--foreground)]/60"
            }`}
          >
            7d
          </button>
          <button
            type="button"
            onClick={() => setRange("30")}
            className={`rounded px-2 py-1 ${
              range === "30" ? "bg-white/20" : "text-[var(--foreground)]/60"
            }`}
          >
            30d
          </button>
        </div>
      </div>
      <Chart days={days} />
      <div className="flex items-center gap-3 text-xs text-[var(--foreground)]/60">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-white/50" />
          Consumed
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-3 bg-[#f0b429]" />
          Target
        </span>
      </div>
    </div>
  );
}

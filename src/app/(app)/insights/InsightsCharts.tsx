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
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-[var(--text)]">
        {label ? DateTime.fromISO(label).toFormat("EEE, MMM d") : ""}
      </p>
      <p className="num text-[var(--text)]">{consumed} kcal consumed</p>
      <p className="num text-[var(--text-muted)]">{target} kcal target</p>
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
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="date"
          tickFormatter={formatTick}
          interval={tickInterval}
          tick={{ fontSize: 11, fill: "var(--text-faint)" }}
          stroke="var(--border)"
        />
        <YAxis
          tickFormatter={formatCalories}
          tick={{ fontSize: 11, fill: "var(--text-faint)" }}
          stroke="var(--border)"
          width={34}
        />
        <Tooltip content={<TooltipContent />} />
        <Bar
          dataKey="consumed"
          fill="var(--accent)"
          radius={[4, 4, 0, 0]}
          isAnimationActive={false}
        />
        <Line
          dataKey="target"
          stroke="var(--info)"
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
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">Calories vs. target</span>
        <div className="flex gap-1 rounded-full bg-surface-3 p-0.5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setRange("7")}
            className={`rounded-full px-2.5 py-1 ${
              range === "7" ? "bg-accent text-accent-ink" : "text-text-muted"
            }`}
          >
            7d
          </button>
          <button
            type="button"
            onClick={() => setRange("30")}
            className={`rounded-full px-2.5 py-1 ${
              range === "30" ? "bg-accent text-accent-ink" : "text-text-muted"
            }`}
          >
            30d
          </button>
        </div>
      </div>
      <Chart days={days} />
      <div className="flex items-center gap-4 text-xs text-text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-accent" />
          Consumed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-3 bg-info" />
          Target
        </span>
      </div>
    </div>
  );
}

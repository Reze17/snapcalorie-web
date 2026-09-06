import { DateTime } from "luxon";
import { redirect } from "next/navigation";
import { InsightsCharts } from "./InsightsCharts";
import { buildChartWindow, computeWindowStats } from "@/lib/insights";
import { computeBestStreak, computeCurrentStreak } from "@/lib/streak";
import { getEffectiveUser } from "@/server/dev-bypass";
import { instantToLocalDate } from "@/server/lib/timezone";
import {
  getDailySummaries,
  getStreakHistory,
} from "@/server/repositories/daily-summaries";
import { getUserById } from "@/server/repositories/users";

export default async function InsightsPage() {
  const effectiveUser = await getEffectiveUser();
  if (!effectiveUser) {
    redirect("/login");
  }

  const user = await getUserById(effectiveUser.id);
  if (!user) {
    redirect("/login");
  }

  const todayLocal = instantToLocalDate(new Date(), user.timezone);
  const from30 = DateTime.fromISO(todayLocal).minus({ days: 29 }).toISODate()!;
  const from7 = DateTime.fromISO(todayLocal).minus({ days: 6 }).toISODate()!;

  const [summaries30, loggedDates] = await Promise.all([
    getDailySummaries(user.id, from30, todayLocal),
    getStreakHistory(user.id),
  ]);

  const window30 = buildChartWindow(
    summaries30,
    from30,
    todayLocal,
    user.dailyCalorieTarget,
  );
  const window7 = window30.filter((day) => day.date >= from7);

  const stats30 = computeWindowStats(window30);
  const stats7 = computeWindowStats(window7);

  const currentStreak = computeCurrentStreak(new Set(loggedDates), todayLocal);
  const bestStreak = computeBestStreak(new Set(loggedDates));

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">Insights</h1>

      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label="Current streak"
          value={`${currentStreak} ${currentStreak === 1 ? "day" : "days"}`}
        />
        <StatTile
          label="Best streak"
          value={`${bestStreak} ${bestStreak === 1 ? "day" : "days"}`}
        />
        <StatTile
          label="Avg intake (30d)"
          value={
            stats30.averageIntake > 0 ? `${stats30.averageIntake} kcal` : "—"
          }
        />
        <StatTile
          label="Days on target (30d)"
          value={`${stats30.daysOnTarget}`}
        />
      </div>

      <p className="text-sm text-[var(--foreground)]/60">
        {currentStreak === 0
          ? "No active streak yet — log a meal today to start one. Every day is a fresh start."
          : "Keep it going, one day at a time."}
      </p>

      <InsightsCharts window7={window7} window30={window30} />

      <div className="grid grid-cols-2 gap-3 text-sm text-[var(--foreground)]/70">
        <p>
          Avg intake (7d):{" "}
          {stats7.averageIntake > 0 ? `${stats7.averageIntake} kcal` : "—"}
        </p>
        <p>Days on target (7d): {stats7.daysOnTarget}</p>
      </div>
    </main>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-white/10 p-3">
      <span className="text-xs text-[var(--foreground)]/60">{label}</span>
      <span className="text-xl font-semibold">{value}</span>
    </div>
  );
}

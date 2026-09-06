import { gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { latencyEvents, users } from "@/db/schema";
import { computeCurrentStreak } from "@/lib/streak";
import { percentile } from "@/lib/percentile";
import { instantToLocalDate } from "@/server/lib/timezone";
import { getStreakHistory } from "./daily-summaries";

export interface MealEditRateResult {
  totalMeals: number;
  cleanMeals: number;
  cleanPercentage: number;
}

/**
 * FRD §7 release metric: "% of meals saved with zero manual edits" (target
 * > 75%). A meal is "clean" when none of its items are is_user_edited —
 * that column already exists (Phase 1), so this is a pure read, no new
 * schema. NOT EXISTS is simplest and correct here; Drizzle's query builder
 * doesn't make a clean correlated-subquery COUNT FILTER easy to express,
 * so this is one of the few places this project drops to raw sql.
 */
export async function getMealEditRate(): Promise<MealEditRateResult> {
  const result = await db.execute<{
    total_meals: number;
    clean_meals: number;
  }>(sql`
    SELECT
      COUNT(*)::int AS total_meals,
      COUNT(*) FILTER (
        WHERE NOT EXISTS (
          SELECT 1 FROM meal_items mi
          WHERE mi.entry_id = meal_entries.entry_id AND mi.is_user_edited = true
        )
      )::int AS clean_meals
    FROM meal_entries
  `);

  const row = result.rows[0];
  const totalMeals = row?.total_meals ?? 0;
  const cleanMeals = row?.clean_meals ?? 0;
  const cleanPercentage =
    totalMeals === 0 ? 0 : Math.round((cleanMeals / totalMeals) * 10000) / 100;

  return { totalMeals, cleanMeals, cleanPercentage };
}

export type StreakBucket = "0" | "1-2" | "3-6" | "7-13" | "14+";

export interface StreakDistribution {
  buckets: Record<StreakBucket, number>;
  totalUsers: number;
}

function bucketFor(streak: number): StreakBucket {
  if (streak === 0) return "0";
  if (streak <= 2) return "1-2";
  if (streak <= 6) return "3-6";
  if (streak <= 13) return "7-13";
  return "14+";
}

/**
 * FRD §7: multi-day retention as a streak-length histogram across all
 * users. Reuses the same pure computeCurrentStreak (Phase 8) each user's
 * dashboard/insights page already trusts, rather than a second streak
 * algorithm — this is one query per user (their own streak history), which
 * is fine at this app's demo scale; a real production version would
 * materialize this instead of computing on every /admin/metrics load.
 */
export async function getStreakDistribution(): Promise<StreakDistribution> {
  const allUsers = await db
    .select({ id: users.id, timezone: users.timezone })
    .from(users);

  const buckets: Record<StreakBucket, number> = {
    "0": 0,
    "1-2": 0,
    "3-6": 0,
    "7-13": 0,
    "14+": 0,
  };

  for (const user of allUsers) {
    const loggedDates = await getStreakHistory(user.id);
    const todayLocal = instantToLocalDate(new Date(), user.timezone);
    const streak = computeCurrentStreak(new Set(loggedDates), todayLocal);
    buckets[bucketFor(streak)] += 1;
  }

  return { buckets, totalUsers: allUsers.length };
}

export interface LatencyStageStats {
  event: string;
  count: number;
  p50: number;
  p75: number;
  p95: number;
}

/**
 * FRD §6 latency NFR: p50/p75/p95 per pipeline stage, over the last
 * `windowHours` (default 24h) of recorded latency_events. Percentiles are
 * computed in JS over the fetched rows rather than in SQL — simple,
 * correct, and this table's per-window row count is small enough that a
 * window-function query would be premature optimization here.
 */
export async function getLatencyStats(
  windowHours = 24,
): Promise<LatencyStageStats[]> {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  const rows = await db
    .select({
      event: latencyEvents.event,
      durationMs: latencyEvents.durationMs,
    })
    .from(latencyEvents)
    .where(gte(latencyEvents.createdAt, since));

  const byEvent = new Map<string, number[]>();
  for (const row of rows) {
    const list = byEvent.get(row.event) ?? [];
    list.push(row.durationMs);
    byEvent.set(row.event, list);
  }

  return Array.from(byEvent.entries())
    .map(([event, durations]) => ({
      event,
      count: durations.length,
      p50: percentile(durations, 50),
      p75: percentile(durations, 75),
      p95: percentile(durations, 95),
    }))
    .sort((a, b) => a.event.localeCompare(b.event));
}

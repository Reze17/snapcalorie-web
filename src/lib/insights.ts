import { DateTime } from "luxon";

export interface ChartDay {
  date: string;
  consumed: number;
  target: number;
  hasEntry: boolean;
}

export interface SummaryRow {
  summaryDate: string;
  consumedCalories: string | number;
  targetCalories: number;
  /** >0 exactly when this day had >=1 meal entry — see daily-summaries.ts. */
  streakCount: number | null;
}

/**
 * Builds a continuous day-by-day series for [fromDate, toDate] (inclusive),
 * filling any day with no daily_summaries row as a zero-value day rather
 * than omitting its x-axis position. Each day's target comes from that
 * day's own stored row (immutable historical snapshot) — a gap day, which
 * was never snapshotted, falls back to the user's current profile target
 * since there is no historical value to preserve for a day that was never
 * touched.
 */
export function buildChartWindow(
  summaries: SummaryRow[],
  fromDate: string,
  toDate: string,
  currentTarget: number,
): ChartDay[] {
  const byDate = new Map(summaries.map((row) => [row.summaryDate, row]));
  const days: ChartDay[] = [];

  let cursor = fromDate;
  while (cursor <= toDate) {
    const row = byDate.get(cursor);
    days.push({
      date: cursor,
      consumed: row ? Number(row.consumedCalories) : 0,
      target: row ? row.targetCalories : currentTarget,
      hasEntry: row ? (row.streakCount ?? 0) > 0 : false,
    });
    const next = DateTime.fromISO(cursor).plus({ days: 1 }).toISODate();
    if (!next) break;
    cursor = next;
  }

  return days;
}

export interface WindowStats {
  averageIntake: number;
  daysOnTarget: number;
}

/**
 * averageIntake is averaged over days that actually have an entry — gap
 * days are excluded rather than counted as zero, so a sparse window
 * doesn't understate real intake. daysOnTarget counts logged days whose
 * consumed calories were at or under that day's own target.
 */
export function computeWindowStats(days: ChartDay[]): WindowStats {
  const loggedDays = days.filter((day) => day.hasEntry);
  if (loggedDays.length === 0) {
    return { averageIntake: 0, daysOnTarget: 0 };
  }

  const totalConsumed = loggedDays.reduce((sum, day) => sum + day.consumed, 0);
  const averageIntake = Math.round(totalConsumed / loggedDays.length);
  const daysOnTarget = loggedDays.filter(
    (day) => day.consumed <= day.target,
  ).length;

  return { averageIntake, daysOnTarget };
}

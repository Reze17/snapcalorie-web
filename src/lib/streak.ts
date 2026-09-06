import { DateTime } from "luxon";

export function previousDay(dateStr: string): string {
  const dt = DateTime.fromISO(dateStr).minus({ days: 1 }).toISODate();
  if (!dt) throw new Error(`Invalid date: ${dateStr}`);
  return dt;
}

function nextDay(dateStr: string): string {
  const dt = DateTime.fromISO(dateStr).plus({ days: 1 }).toISODate();
  if (!dt) throw new Error(`Invalid date: ${dateStr}`);
  return dt;
}

/**
 * Consecutive calendar days (in the user's timezone — callers pass
 * already-resolved local date strings) ending today that have >=1 entry.
 *
 * If today has no entry yet, the streak is anchored at yesterday instead —
 * it must not appear broken just because today isn't over. Anchoring at
 * yesterday and walking backward, rather than walking forward from some
 * start date, is what makes a single missing day (anywhere in the past)
 * correctly stop the count instead of resetting to a wrong value.
 */
export function computeCurrentStreak(
  loggedDates: ReadonlySet<string>,
  todayLocal: string,
): number {
  let cursor = loggedDates.has(todayLocal) ? todayLocal : previousDay(todayLocal);
  let count = 0;
  while (loggedDates.has(cursor)) {
    count += 1;
    cursor = previousDay(cursor);
  }
  return count;
}

/** The longest run of consecutive logged days anywhere in the history — not anchored to today. */
export function computeBestStreak(loggedDates: ReadonlySet<string>): number {
  if (loggedDates.size === 0) return 0;

  const sorted = Array.from(loggedDates).sort();
  let best = 1;
  let current = 1;

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === nextDay(sorted[i - 1])) {
      current += 1;
    } else {
      current = 1;
    }
    best = Math.max(best, current);
  }

  return best;
}

import Decimal from "decimal.js";
import { and, desc, eq, gt, gte, lte, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { dailySummaries, mealEntries, users } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { previousDay } from "@/lib/streak";
import { localDayRangeUtc } from "@/server/lib/timezone";

/**
 * Recomputes and upserts a user's daily_summaries row for one local
 * calendar day (FRD §4). target_calories is an immutable snapshot: it is
 * set only on first write for that (user, day) and never overwritten by
 * later target changes, per CLAUDE.md.
 *
 * streak_count is persisted incrementally here (FR-09): a day with >=1
 * entry gets yesterday's persisted streak_count + 1; a day with none gets
 * 0. A day that was never touched (no entries ever) simply has no row,
 * which reads the same as "0" for this lookup — so gaps naturally break
 * the chain without needing to enumerate them. This only self-corrects
 * forward from whichever day is recalculated; it does not retroactively
 * repair later days if a much older day's entries are edited after the
 * fact. src/app/(app)/insights reads the persisted values through
 * src/lib/streak.ts's pure functions rather than trusting a single row
 * blindly, so the *displayed* current/best streak stays correct even if
 * that edge case ever bites.
 */
export async function recalculateDailySummary(
  executor: DbOrTx,
  userId: string,
  localDate: string,
): Promise<void> {
  const [user] = await executor
    .select({
      timezone: users.timezone,
      dailyCalorieTarget: users.dailyCalorieTarget,
    })
    .from(users)
    .where(eq(users.id, userId));

  if (!user) {
    throw new Error(`User ${userId} not found`);
  }

  const { startUtc, endUtc } = localDayRangeUtc(user.timezone, localDate);

  const entries = await executor
    .select({ totalCalories: mealEntries.totalCalories })
    .from(mealEntries)
    .where(
      and(
        eq(mealEntries.userId, userId),
        gte(mealEntries.loggedAt, startUtc),
        lt(mealEntries.loggedAt, endUtc),
      ),
    );

  const consumed = entries.reduce(
    (sum, entry) => sum.plus(new Decimal(entry.totalCalories)),
    new Decimal(0),
  );

  const [existingSummary] = await executor
    .select({ targetCalories: dailySummaries.targetCalories })
    .from(dailySummaries)
    .where(
      and(
        eq(dailySummaries.userId, userId),
        eq(dailySummaries.summaryDate, localDate),
      ),
    );

  const targetCalories =
    existingSummary?.targetCalories ?? user.dailyCalorieTarget;

  const achievementPercentage =
    targetCalories === 0
      ? new Decimal(0)
      : consumed.dividedBy(targetCalories).times(100);

  const hasEntry = entries.length > 0;
  const [yesterdaySummary] = await executor
    .select({ streakCount: dailySummaries.streakCount })
    .from(dailySummaries)
    .where(
      and(
        eq(dailySummaries.userId, userId),
        eq(dailySummaries.summaryDate, previousDay(localDate)),
      ),
    );
  const streakCount = hasEntry ? (yesterdaySummary?.streakCount ?? 0) + 1 : 0;

  await executor
    .insert(dailySummaries)
    .values({
      userId,
      summaryDate: localDate,
      targetCalories,
      consumedCalories: consumed.toFixed(2),
      achievementPercentage: achievementPercentage.toFixed(2),
      streakCount,
    })
    .onConflictDoUpdate({
      target: [dailySummaries.userId, dailySummaries.summaryDate],
      set: {
        consumedCalories: consumed.toFixed(2),
        achievementPercentage: achievementPercentage.toFixed(2),
        streakCount,
      },
    });
}

export async function getDailySummary(userId: string, localDate: string) {
  const [summary] = await db
    .select()
    .from(dailySummaries)
    .where(
      and(
        eq(dailySummaries.userId, userId),
        eq(dailySummaries.summaryDate, localDate),
      ),
    );
  return summary;
}

export async function getDailySummaries(
  userId: string,
  fromDate: string,
  toDate: string,
) {
  return db
    .select()
    .from(dailySummaries)
    .where(
      and(
        eq(dailySummaries.userId, userId),
        gte(dailySummaries.summaryDate, fromDate),
        lte(dailySummaries.summaryDate, toDate),
      ),
    )
    .orderBy(dailySummaries.summaryDate);
}

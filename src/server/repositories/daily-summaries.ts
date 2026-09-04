import Decimal from "decimal.js";
import { and, eq, gte, lte, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { dailySummaries, mealEntries, users } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { localDayRangeUtc } from "@/server/lib/timezone";

/**
 * Recomputes and upserts a user's daily_summaries row for one local
 * calendar day (FRD §4). target_calories is an immutable snapshot: it is
 * set only on first write for that (user, day) and never overwritten by
 * later target changes, per CLAUDE.md.
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

  await executor
    .insert(dailySummaries)
    .values({
      userId,
      summaryDate: localDate,
      targetCalories,
      consumedCalories: consumed.toFixed(2),
      achievementPercentage: achievementPercentage.toFixed(2),
    })
    .onConflictDoUpdate({
      target: [dailySummaries.userId, dailySummaries.summaryDate],
      set: {
        consumedCalories: consumed.toFixed(2),
        achievementPercentage: achievementPercentage.toFixed(2),
      },
    });
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

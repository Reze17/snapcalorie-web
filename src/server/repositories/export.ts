import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { mealEntries, mealItems, users } from "@/db/schema";
import type { ExportSourceEntry, ExportSourceSummary } from "@/lib/export";
import { instantToLocalDate, localDayRangeUtc } from "@/server/lib/timezone";
import { getDailySummaries } from "./daily-summaries";

/** The local date of the user's very first meal entry, or null if they have none yet. */
export async function getEarliestEntryLocalDate(
  userId: string,
): Promise<string | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return null;

  const [earliest] = await db
    .select({ loggedAt: mealEntries.loggedAt })
    .from(mealEntries)
    .where(eq(mealEntries.userId, userId))
    .orderBy(asc(mealEntries.loggedAt))
    .limit(1);
  if (!earliest) return null;

  return instantToLocalDate(earliest.loggedAt, user.timezone);
}

export interface ExportData {
  timezone: string;
  fallbackTarget: number;
  entries: ExportSourceEntry[];
  summariesByDate: Map<string, ExportSourceSummary>;
}

/**
 * Everything the CSV/PDF builders in src/lib/export.ts need for one user
 * over [fromDate, toDate] (inclusive, local calendar days) — one query for
 * entries in range, one batched query for their items, one query reusing
 * Phase 8's getDailySummaries. userId must come from the caller's own
 * authenticated/effective session; this function does no authorization of
 * its own.
 */
export async function getExportData(
  userId: string,
  fromDate: string,
  toDate: string,
): Promise<ExportData> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) {
    throw new Error(`User ${userId} not found`);
  }

  const { startUtc } = localDayRangeUtc(user.timezone, fromDate);
  const { endUtc } = localDayRangeUtc(user.timezone, toDate);

  const rawEntries = await db
    .select()
    .from(mealEntries)
    .where(
      and(
        eq(mealEntries.userId, userId),
        gte(mealEntries.loggedAt, startUtc),
        lt(mealEntries.loggedAt, endUtc),
      ),
    )
    .orderBy(asc(mealEntries.loggedAt));

  const items =
    rawEntries.length === 0
      ? []
      : await db
          .select()
          .from(mealItems)
          .where(
            inArray(
              mealItems.entryId,
              rawEntries.map((entry) => entry.entryId),
            ),
          );

  const itemsByEntryId = new Map<string, typeof items>();
  for (const item of items) {
    const list = itemsByEntryId.get(item.entryId) ?? [];
    list.push(item);
    itemsByEntryId.set(item.entryId, list);
  }

  const entries: ExportSourceEntry[] = rawEntries.map((entry) => ({
    entryId: entry.entryId,
    loggedAt: entry.loggedAt,
    localDate: instantToLocalDate(entry.loggedAt, user.timezone),
    totalCalories: entry.totalCalories,
    items: (itemsByEntryId.get(entry.entryId) ?? []).map((item) => ({
      foodName: item.foodName,
      portionGrams: item.portionGrams,
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      aiConfidence: item.aiConfidence,
      isUserEdited: item.isUserEdited,
    })),
  }));

  const summaries = await getDailySummaries(userId, fromDate, toDate);
  const summariesByDate = new Map<string, ExportSourceSummary>(
    summaries.map((summary) => [
      summary.summaryDate,
      {
        summaryDate: summary.summaryDate,
        targetCalories: summary.targetCalories,
        consumedCalories: summary.consumedCalories,
        achievementPercentage: summary.achievementPercentage,
      },
    ]),
  );

  return {
    timezone: user.timezone,
    fallbackTarget: user.dailyCalorieTarget,
    entries,
    summariesByDate,
  };
}

import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { weightLogs } from "@/db/schema";
import type { DbOrTx } from "@/db/types";

/**
 * One entry per local day — logging today's weight again corrects it
 * rather than creating a second row, same upsert pattern as
 * daily_summaries. `executor` defaults to the top-level db so this can
 * also be called inside completeOnboarding's transaction.
 */
export async function upsertWeightLog(
  userId: string,
  localDate: string,
  weightKg: number,
  executor: DbOrTx = db,
) {
  await executor
    .insert(weightLogs)
    .values({ userId, loggedDate: localDate, weightKg: weightKg.toFixed(1) })
    .onConflictDoUpdate({
      target: [weightLogs.userId, weightLogs.loggedDate],
      set: { weightKg: weightKg.toFixed(1) },
    });
}

/** Ordered oldest-first — what the weight-trend chart plots. */
export async function getWeightHistory(
  userId: string,
  fromDate: string,
  toDate: string,
) {
  return db
    .select()
    .from(weightLogs)
    .where(
      and(
        eq(weightLogs.userId, userId),
        gte(weightLogs.loggedDate, fromDate),
        lte(weightLogs.loggedDate, toDate),
      ),
    )
    .orderBy(asc(weightLogs.loggedDate));
}

/** The most recent entry — this app's definition of "current weight"
 * (there is no separate current-weight column on users; see schema.ts). */
export async function getLatestWeight(userId: string) {
  const [row] = await db
    .select()
    .from(weightLogs)
    .where(eq(weightLogs.userId, userId))
    .orderBy(desc(weightLogs.loggedDate))
    .limit(1);
  return row;
}

/** The very first entry — the onboarding "starting weight", used by the
 * weight-progress card's percent-to-goal calculation. */
export async function getFirstWeight(userId: string) {
  const [row] = await db
    .select()
    .from(weightLogs)
    .where(eq(weightLogs.userId, userId))
    .orderBy(asc(weightLogs.loggedDate))
    .limit(1);
  return row;
}

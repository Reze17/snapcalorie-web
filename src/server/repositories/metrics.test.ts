// @vitest-environment node
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { latencyEvents, mealEntries, mealItems, users } from "@/db/schema";
import { recalculateDailySummary } from "./daily-summaries";
import {
  getLatencyStats,
  getMealEditRate,
  getStreakDistribution,
} from "./metrics";

describe("metrics repository", () => {
  let userId: string;
  const timezone = "America/Los_Angeles";

  beforeAll(async () => {
    const [user] = await db
      .insert(users)
      .values({
        email: `test-metrics-${randomUUID()}@snapcalorie.dev`,
        timezone,
      })
      .returning();
    userId = user.id;
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, userId));
  });

  it("getMealEditRate counts a meal as clean only when none of its items are user-edited", async () => {
    const before = await getMealEditRate();

    const [cleanEntry] = await db
      .insert(mealEntries)
      .values({
        userId,
        imageStoragePath: "test/clean.jpg",
        totalCalories: "100.00",
        totalProtein: "5.00",
        totalCarbs: "10.00",
        totalFat: "2.00",
        loggedAt: new Date("2026-03-01T12:00:00Z"),
      })
      .returning();
    await db.insert(mealItems).values({
      entryId: cleanEntry.entryId,
      foodName: "Clean item",
      portionGrams: "100.00",
      calories: "100.00",
      protein: "5.00",
      carbs: "10.00",
      fat: "2.00",
      isUserEdited: false,
    });

    const [editedEntry] = await db
      .insert(mealEntries)
      .values({
        userId,
        imageStoragePath: "test/edited.jpg",
        totalCalories: "200.00",
        totalProtein: "10.00",
        totalCarbs: "20.00",
        totalFat: "4.00",
        loggedAt: new Date("2026-03-02T12:00:00Z"),
      })
      .returning();
    await db.insert(mealItems).values({
      entryId: editedEntry.entryId,
      foodName: "Edited item",
      portionGrams: "100.00",
      calories: "200.00",
      protein: "10.00",
      carbs: "20.00",
      fat: "4.00",
      isUserEdited: true,
    });

    const after = await getMealEditRate();
    // >= rather than exact equality: this is a genuinely global,
    // unscoped aggregate (that's the point of the metric), so it can't
    // be isolated from other test files/e2e runs writing to the same
    // shared dev database concurrently. The inequalities below still
    // pin down the actual behavior being tested: our clean entry must
    // be counted as clean, and our edited one must not be.
    const dirtyBefore = before.totalMeals - before.cleanMeals;
    const dirtyAfter = after.totalMeals - after.cleanMeals;
    expect(after.totalMeals).toBeGreaterThanOrEqual(before.totalMeals + 2);
    expect(after.cleanMeals).toBeGreaterThanOrEqual(before.cleanMeals + 1);
    expect(dirtyAfter).toBeGreaterThanOrEqual(dirtyBefore + 1);
  });

  it("getStreakDistribution buckets a user with no entries as streak 0", async () => {
    const distribution = await getStreakDistribution();
    expect(distribution.totalUsers).toBeGreaterThanOrEqual(1);
    // This test user has no meal_entries at all, so contributes to bucket "0".
    expect(distribution.buckets["0"]).toBeGreaterThanOrEqual(1);
  });

  it("getStreakDistribution buckets a user with a logged-today entry into 1-2", async () => {
    const [entry] = await db
      .insert(mealEntries)
      .values({
        userId,
        imageStoragePath: "test/today.jpg",
        totalCalories: "300.00",
        totalProtein: "10.00",
        totalCarbs: "30.00",
        totalFat: "5.00",
        loggedAt: new Date(),
      })
      .returning();
    await db.insert(mealItems).values({
      entryId: entry.entryId,
      foodName: "Today item",
      portionGrams: "100.00",
      calories: "300.00",
      protein: "10.00",
      carbs: "30.00",
      fat: "5.00",
      isUserEdited: false,
    });
    const { instantToLocalDate } = await import("@/server/lib/timezone");
    const todayLocal = instantToLocalDate(new Date(), timezone);
    await recalculateDailySummary(db, userId, todayLocal);

    const distribution = await getStreakDistribution();
    expect(distribution.buckets["1-2"]).toBeGreaterThanOrEqual(1);
  });

  it("getLatencyStats computes percentiles per event within the time window", async () => {
    const uniqueEvent = `t_${randomUUID().slice(0, 8)}`;
    await db.insert(latencyEvents).values([
      { event: uniqueEvent, durationMs: 100 },
      { event: uniqueEvent, durationMs: 200 },
      { event: uniqueEvent, durationMs: 300 },
      { event: uniqueEvent, durationMs: 400 },
    ]);

    const stats = await getLatencyStats(24);
    const stat = stats.find((s) => s.event === uniqueEvent);
    expect(stat).toBeDefined();
    expect(stat?.count).toBe(4);
    expect(stat?.p50).toBe(200);

    await db.delete(latencyEvents).where(eq(latencyEvents.event, uniqueEvent));
  });

  it("getLatencyStats excludes events outside the requested window", async () => {
    const uniqueEvent = `o_${randomUUID().slice(0, 8)}`;
    const [row] = await db
      .insert(latencyEvents)
      .values({ event: uniqueEvent, durationMs: 999 })
      .returning();
    await db
      .update(latencyEvents)
      .set({ createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000) })
      .where(eq(latencyEvents.id, row.id));

    const stats = await getLatencyStats(24);
    expect(stats.find((s) => s.event === uniqueEvent)).toBeUndefined();

    await db.delete(latencyEvents).where(eq(latencyEvents.event, uniqueEvent));
  });
});

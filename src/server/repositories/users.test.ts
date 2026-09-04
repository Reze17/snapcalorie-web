// @vitest-environment node
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { dailySummaries, mealEntries, users } from "@/db/schema";
import { recalculateDailySummary } from "./daily-summaries";
import { updateUserProfile } from "./users";

describe("updateUserProfile", () => {
  let userId: string;

  beforeAll(async () => {
    const [user] = await db
      .insert(users)
      .values({
        email: `test-${randomUUID()}@snapcalorie.dev`,
        timezone: "UTC",
        dailyCalorieTarget: 2000,
      })
      .returning();
    userId = user.id;
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, userId));
  });

  it("updates the profile without touching daily_summaries, so past days keep their target", async () => {
    // A "last week" day, already summarized under the original 2000 target.
    await db.insert(mealEntries).values({
      userId,
      imageStoragePath: "test/last-week.jpg",
      totalCalories: "500.00",
      totalProtein: "0.00",
      totalCarbs: "0.00",
      totalFat: "0.00",
      loggedAt: new Date("2026-01-01T12:00:00.000Z"),
    });
    await recalculateDailySummary(db, userId, "2026-01-01");

    const [before] = await db
      .select()
      .from(dailySummaries)
      .where(
        and(
          eq(dailySummaries.userId, userId),
          eq(dailySummaries.summaryDate, "2026-01-01"),
        ),
      );
    expect(before.targetCalories).toBe(2000);

    const updated = await updateUserProfile(userId, {
      dailyCalorieTarget: 2400,
      timezone: "UTC",
    });
    expect(updated.dailyCalorieTarget).toBe(2400);

    const [after] = await db
      .select()
      .from(dailySummaries)
      .where(
        and(
          eq(dailySummaries.userId, userId),
          eq(dailySummaries.summaryDate, "2026-01-01"),
        ),
      );
    expect(after.targetCalories).toBe(2000); // unchanged
    expect(after.consumedCalories).toBe(before.consumedCalories);

    // A brand-new day, recalculated after the profile change, snapshots the new target.
    await db.insert(mealEntries).values({
      userId,
      imageStoragePath: "test/new-day.jpg",
      totalCalories: "300.00",
      totalProtein: "0.00",
      totalCarbs: "0.00",
      totalFat: "0.00",
      loggedAt: new Date("2026-01-02T12:00:00.000Z"),
    });
    await recalculateDailySummary(db, userId, "2026-01-02");
    const [newDay] = await db
      .select()
      .from(dailySummaries)
      .where(
        and(
          eq(dailySummaries.userId, userId),
          eq(dailySummaries.summaryDate, "2026-01-02"),
        ),
      );
    expect(newDay.targetCalories).toBe(2400);
  });
});

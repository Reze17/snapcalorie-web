// @vitest-environment node
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { dailySummaries, mealEntries, users } from "@/db/schema";
import { recalculateDailySummary } from "./daily-summaries";

describe("recalculateDailySummary", () => {
  const timezone = "America/Los_Angeles";
  let userId: string;

  beforeAll(async () => {
    const [user] = await db
      .insert(users)
      .values({
        email: `test-${randomUUID()}@snapcalorie.dev`,
        timezone,
        dailyCalorieTarget: 2000,
      })
      .returning();
    userId = user.userId;
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.userId, userId));
  });

  async function insertEntry(totalCalories: string, loggedAt: Date) {
    await db.insert(mealEntries).values({
      userId,
      imageStoragePath: "test/fixture.jpg",
      totalCalories,
      totalProtein: "0.00",
      totalCarbs: "0.00",
      totalFat: "0.00",
      loggedAt,
    });
  }

  async function getSummary(localDate: string) {
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

  it("creates a summary on first write, snapshotting the current target", async () => {
    // 2026-01-05T18:00:00Z = 10:00 PST on 2026-01-05
    await insertEntry("500.00", new Date("2026-01-05T18:00:00.000Z"));
    await recalculateDailySummary(db, userId, "2026-01-05");

    const summary = await getSummary("2026-01-05");
    expect(summary).toBeDefined();
    expect(summary.targetCalories).toBe(2000);
    expect(summary.consumedCalories).toBe("500.00");
    expect(summary.achievementPercentage).toBe("25.00");
  });

  it("upserts on a second recalculation instead of duplicating the row", async () => {
    // 2026-01-05T20:00:00Z = 12:00 PST, same local day
    await insertEntry("300.00", new Date("2026-01-05T20:00:00.000Z"));
    await recalculateDailySummary(db, userId, "2026-01-05");
    await recalculateDailySummary(db, userId, "2026-01-05"); // idempotent re-run

    const rows = await db
      .select()
      .from(dailySummaries)
      .where(
        and(
          eq(dailySummaries.userId, userId),
          eq(dailySummaries.summaryDate, "2026-01-05"),
        ),
      );

    expect(rows).toHaveLength(1);
    expect(rows[0].consumedCalories).toBe("800.00");
    expect(rows[0].achievementPercentage).toBe("40.00");
  });

  it("keeps a day's target_calories immutable after the user's target changes", async () => {
    await db
      .update(users)
      .set({ dailyCalorieTarget: 2500 })
      .where(eq(users.userId, userId));

    await insertEntry("100.00", new Date("2026-01-05T21:00:00.000Z"));
    await recalculateDailySummary(db, userId, "2026-01-05");

    const summary = await getSummary("2026-01-05");
    expect(summary.targetCalories).toBe(2000); // unchanged: snapshot from first write
    expect(summary.consumedCalories).toBe("900.00");

    // A brand new day, recalculated after the target change, snapshots the new target.
    await insertEntry("250.00", new Date("2026-01-06T18:00:00.000Z"));
    await recalculateDailySummary(db, userId, "2026-01-06");
    const newDaySummary = await getSummary("2026-01-06");
    expect(newDaySummary.targetCalories).toBe(2500);

    await db
      .update(users)
      .set({ dailyCalorieTarget: 2000 })
      .where(eq(users.userId, userId));
  });

  it("resolves timezone-correct day boundaries: 23:30 and 00:30 local land on different days", async () => {
    // 2026-02-10 23:30 PST = 2026-02-11T07:30:00Z
    await insertEntry("111.00", new Date("2026-02-11T07:30:00.000Z"));
    // 2026-02-11 00:30 PST = 2026-02-11T08:30:00Z
    await insertEntry("222.00", new Date("2026-02-11T08:30:00.000Z"));

    await recalculateDailySummary(db, userId, "2026-02-10");
    await recalculateDailySummary(db, userId, "2026-02-11");

    const feb10 = await getSummary("2026-02-10");
    const feb11 = await getSummary("2026-02-11");

    expect(feb10.consumedCalories).toBe("111.00");
    expect(feb11.consumedCalories).toBe("222.00");
  });
});

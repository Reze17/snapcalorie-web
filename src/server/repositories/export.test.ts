// @vitest-environment node
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { mealEntries, mealItems, users } from "@/db/schema";
import { recalculateDailySummary } from "./daily-summaries";
import { getEarliestEntryLocalDate, getExportData } from "./export";

describe("export repository", () => {
  const timezone = "America/Los_Angeles";
  let userId: string;

  beforeAll(async () => {
    const [user] = await db
      .insert(users)
      .values({
        email: `test-export-${randomUUID()}@snapcalorie.dev`,
        timezone,
        dailyCalorieTarget: 2000,
      })
      .returning();
    userId = user.id;
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, userId));
  });

  it("returns null earliest date for a user with no entries", async () => {
    const result = await getEarliestEntryLocalDate(userId);
    expect(result).toBeNull();
  });

  it("scopes entries, items, and summaries to the requested range for one user", async () => {
    const [entry1] = await db
      .insert(mealEntries)
      .values({
        userId,
        imageStoragePath: "test/export-1.jpg",
        totalCalories: "300.00",
        totalProtein: "20.00",
        totalCarbs: "30.00",
        totalFat: "10.00",
        // 2026-04-05 10:00 PDT
        loggedAt: new Date("2026-04-05T17:00:00.000Z"),
      })
      .returning();
    await db.insert(mealItems).values({
      entryId: entry1.entryId,
      foodName: "Test food",
      portionGrams: "200.00",
      calories: "300.00",
      protein: "20.00",
      carbs: "30.00",
      fat: "10.00",
      aiConfidence: "0.85",
      isUserEdited: false,
    });
    await recalculateDailySummary(db, userId, "2026-04-05");

    // An entry outside the requested range — must not appear in the export.
    const [entryOutOfRange] = await db
      .insert(mealEntries)
      .values({
        userId,
        imageStoragePath: "test/export-2.jpg",
        totalCalories: "400.00",
        totalProtein: "20.00",
        totalCarbs: "30.00",
        totalFat: "10.00",
        loggedAt: new Date("2026-05-01T17:00:00.000Z"),
      })
      .returning();
    await recalculateDailySummary(db, userId, "2026-05-01");

    const earliest = await getEarliestEntryLocalDate(userId);
    expect(earliest).toBe("2026-04-05");

    const data = await getExportData(userId, "2026-04-01", "2026-04-30");
    expect(data.timezone).toBe(timezone);
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].entryId).toBe(entry1.entryId);
    expect(data.entries[0].localDate).toBe("2026-04-05");
    expect(data.entries[0].items).toHaveLength(1);
    expect(data.entries[0].items[0].foodName).toBe("Test food");

    const summary = data.summariesByDate.get("2026-04-05");
    expect(summary?.targetCalories).toBe(2000);
    expect(summary?.consumedCalories).toBe("300.00");

    // The out-of-range entry's day must not leak into this window's data.
    expect(data.summariesByDate.has("2026-05-01")).toBe(false);
    expect(
      data.entries.some((e) => e.entryId === entryOutOfRange.entryId),
    ).toBe(false);
  });
});

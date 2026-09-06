import { describe, expect, it } from "vitest";
import { buildChartWindow, computeWindowStats } from "./insights";

describe("buildChartWindow", () => {
  it("fills every day in range even with no summaries at all", () => {
    const days = buildChartWindow([], "2026-03-01", "2026-03-03", 2000);
    expect(days.map((d) => d.date)).toEqual([
      "2026-03-01",
      "2026-03-02",
      "2026-03-03",
    ]);
    expect(days.every((d) => d.consumed === 0 && !d.hasEntry)).toBe(true);
    expect(days.every((d) => d.target === 2000)).toBe(true);
  });

  it("keeps the x-axis continuous around a gap day in the middle", () => {
    const days = buildChartWindow(
      [
        {
          summaryDate: "2026-03-01",
          consumedCalories: "1800.00",
          targetCalories: 2000,
          streakCount: 1,
        },
        // 2026-03-02 is a gap — no row.
        {
          summaryDate: "2026-03-03",
          consumedCalories: "2100.00",
          targetCalories: 2000,
          streakCount: 1,
        },
      ],
      "2026-03-01",
      "2026-03-03",
      2000,
    );
    expect(days).toHaveLength(3);
    expect(days[1]).toMatchObject({
      date: "2026-03-02",
      consumed: 0,
      hasEntry: false,
    });
  });

  it("uses each day's own stored target, not the current profile target", () => {
    const days = buildChartWindow(
      [
        {
          summaryDate: "2026-03-01",
          consumedCalories: "1800.00",
          targetCalories: 1800, // old target, snapshotted before a later change
          streakCount: 1,
        },
      ],
      "2026-03-01",
      "2026-03-02",
      2200, // user's current target, changed since
    );
    expect(days[0].target).toBe(1800);
    // The gap day (never snapshotted) falls back to the current target.
    expect(days[1].target).toBe(2200);
  });

  it("treats a row with streak_count 0 (all entries deleted) as no entry", () => {
    const days = buildChartWindow(
      [
        {
          summaryDate: "2026-03-01",
          consumedCalories: "0.00",
          targetCalories: 2000,
          streakCount: 0,
        },
      ],
      "2026-03-01",
      "2026-03-01",
      2000,
    );
    expect(days[0].hasEntry).toBe(false);
  });
});

describe("computeWindowStats", () => {
  it("returns zeros for a window with no logged days", () => {
    const days = buildChartWindow([], "2026-03-01", "2026-03-02", 2000);
    expect(computeWindowStats(days)).toEqual({
      averageIntake: 0,
      daysOnTarget: 0,
    });
  });

  it("averages only over days that have an entry, ignoring gaps", () => {
    const days = buildChartWindow(
      [
        {
          summaryDate: "2026-03-01",
          consumedCalories: "1000.00",
          targetCalories: 2000,
          streakCount: 1,
        },
        {
          summaryDate: "2026-03-03",
          consumedCalories: "2000.00",
          targetCalories: 2000,
          streakCount: 1,
        },
      ],
      "2026-03-01",
      "2026-03-03",
      2000,
    );
    // (1000 + 2000) / 2 logged days = 1500, not /3 total days.
    expect(computeWindowStats(days).averageIntake).toBe(1500);
  });

  it("counts days on target using each day's own target", () => {
    const days = buildChartWindow(
      [
        {
          summaryDate: "2026-03-01",
          consumedCalories: "1900.00",
          targetCalories: 2000,
          streakCount: 1,
        },
        {
          summaryDate: "2026-03-02",
          consumedCalories: "2500.00",
          targetCalories: 2000,
          streakCount: 1,
        },
      ],
      "2026-03-01",
      "2026-03-02",
      2000,
    );
    expect(computeWindowStats(days).daysOnTarget).toBe(1);
  });
});

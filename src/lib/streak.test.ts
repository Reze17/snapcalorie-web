import { describe, expect, it } from "vitest";
import { instantToLocalDate } from "@/server/lib/timezone";
import { computeBestStreak, computeCurrentStreak } from "./streak";

describe("computeCurrentStreak", () => {
  it("returns 0 for an empty history", () => {
    expect(computeCurrentStreak(new Set(), "2026-03-10")).toBe(0);
  });

  it("returns 1 for a single day logged today", () => {
    expect(computeCurrentStreak(new Set(["2026-03-10"]), "2026-03-10")).toBe(1);
  });

  it("counts a consecutive run ending today", () => {
    const days = new Set(["2026-03-08", "2026-03-09", "2026-03-10"]);
    expect(computeCurrentStreak(days, "2026-03-10")).toBe(3);
  });

  it("a one-day gap resets the streak", () => {
    // Logged 3 days ago and today, but not yesterday or the day before.
    const days = new Set(["2026-03-07", "2026-03-10"]);
    expect(computeCurrentStreak(days, "2026-03-10")).toBe(1);
  });

  it("logging yesterday and today gives a streak of 2", () => {
    const days = new Set(["2026-03-09", "2026-03-10"]);
    expect(computeCurrentStreak(days, "2026-03-10")).toBe(2);
  });

  it("does not break the streak just because today hasn't been logged yet", () => {
    // Today (2026-03-10) has no entry yet, but yesterday and the day
    // before do — the streak should still read 2, anchored at yesterday.
    const days = new Set(["2026-03-08", "2026-03-09"]);
    expect(computeCurrentStreak(days, "2026-03-10")).toBe(2);
  });

  it("returns 0 when neither today nor yesterday has an entry", () => {
    const days = new Set(["2026-03-01"]);
    expect(computeCurrentStreak(days, "2026-03-10")).toBe(0);
  });

  it("handles a run crossing a month boundary", () => {
    const days = new Set([
      "2026-02-27",
      "2026-02-28",
      "2026-03-01",
      "2026-03-02",
    ]);
    expect(computeCurrentStreak(days, "2026-03-02")).toBe(4);
  });

  it("is correct in a non-UTC timezone with entries near midnight", () => {
    const timezone = "America/Los_Angeles";
    // 2026-03-09 23:30 PDT = 2026-03-10T06:30:00Z
    // 2026-03-10 00:30 PDT = 2026-03-10T07:30:00Z
    const instants = [
      new Date("2026-03-10T06:30:00.000Z"),
      new Date("2026-03-10T07:30:00.000Z"),
    ];
    const loggedDates = new Set(
      instants.map((instant) => instantToLocalDate(instant, timezone)),
    );
    expect(loggedDates).toEqual(new Set(["2026-03-09", "2026-03-10"]));
    expect(computeCurrentStreak(loggedDates, "2026-03-10")).toBe(2);
  });
});

describe("computeBestStreak", () => {
  it("returns 0 for an empty history", () => {
    expect(computeBestStreak(new Set())).toBe(0);
  });

  it("returns 1 for a single logged day", () => {
    expect(computeBestStreak(new Set(["2026-03-10"]))).toBe(1);
  });

  it("finds the longest run anywhere in the history, not just at the end", () => {
    const days = new Set([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
      "2026-01-04",
      "2026-01-05",
      "2026-02-01", // isolated day, well after the run above
    ]);
    expect(computeBestStreak(days)).toBe(5);
  });

  it("a one-day gap splits runs and does not merge them", () => {
    const days = new Set(["2026-03-01", "2026-03-02", "2026-03-04"]);
    expect(computeBestStreak(days)).toBe(2);
  });

  it("handles a run crossing a month boundary", () => {
    const days = new Set(["2026-02-27", "2026-02-28", "2026-03-01"]);
    expect(computeBestStreak(days)).toBe(3);
  });
});

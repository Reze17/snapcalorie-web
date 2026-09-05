import { describe, expect, it } from "vitest";
import { computeDailyMetrics } from "./daily-metrics";

describe("computeDailyMetrics", () => {
  it("computes an under-target day", () => {
    const metrics = computeDailyMetrics(1500, 2000);
    expect(metrics).toEqual({
      consumed: 1500,
      target: 2000,
      remaining: 500,
      achievementPercentage: 75,
    });
  });

  it("computes a day exactly at target", () => {
    const metrics = computeDailyMetrics(2000, 2000);
    expect(metrics).toEqual({
      consumed: 2000,
      target: 2000,
      remaining: 0,
      achievementPercentage: 100,
    });
  });

  it("computes an over-target day with a negative remaining, uncapped percentage", () => {
    const metrics = computeDailyMetrics(2320, 2000);
    expect(metrics).toEqual({
      consumed: 2320,
      target: 2000,
      remaining: -320,
      achievementPercentage: 116,
    });
  });

  it("computes a day with zero entries", () => {
    const metrics = computeDailyMetrics(0, 2000);
    expect(metrics).toEqual({
      consumed: 0,
      target: 2000,
      remaining: 2000,
      achievementPercentage: 0,
    });
  });

  it("does not divide by zero when target is 0", () => {
    const metrics = computeDailyMetrics(500, 0);
    expect(metrics.achievementPercentage).toBe(0);
    expect(metrics.remaining).toBe(-500);
  });

  it("rounds to 2 decimal places", () => {
    const metrics = computeDailyMetrics(1000, 3000);
    expect(metrics.achievementPercentage).toBe(33.33);
  });
});

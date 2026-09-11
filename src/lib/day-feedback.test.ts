import { describe, expect, it } from "vitest";
import { evaluateDayStatus, evaluateProspectiveMeal } from "./day-feedback";

describe("evaluateProspectiveMeal", () => {
  it("stays within target", () => {
    const check = evaluateProspectiveMeal(1850, 700, 820);
    expect(check).toEqual({
      afterTotal: 1520,
      remainingAfter: 330,
      isOverTarget: false,
      overBy: 0,
    });
  });

  it("flags going over target", () => {
    const check = evaluateProspectiveMeal(1850, 1400, 700);
    expect(check).toEqual({
      afterTotal: 2100,
      remainingAfter: -250,
      isOverTarget: true,
      overBy: 250,
    });
  });

  it("treats landing exactly on target as not over", () => {
    const check = evaluateProspectiveMeal(2000, 1500, 500);
    expect(check.isOverTarget).toBe(false);
    expect(check.overBy).toBe(0);
  });
});

describe("evaluateDayStatus", () => {
  it("reports no_entries for a fresh day", () => {
    expect(evaluateDayStatus(0, 1850)).toEqual({ kind: "no_entries" });
  });

  it("reports over with the overage amount", () => {
    expect(evaluateDayStatus(1900, 1850)).toEqual({ kind: "over", overBy: 50 });
  });

  it("reports near_target within the threshold, not yet over", () => {
    expect(evaluateDayStatus(1650, 1850)).toEqual({
      kind: "near_target",
      remaining: 200,
    });
  });

  it("reports under when significantly below target", () => {
    expect(evaluateDayStatus(900, 1850)).toEqual({
      kind: "under",
      consumed: 900,
      target: 1850,
    });
  });

  it("reports on_track for a healthy middle range", () => {
    expect(evaluateDayStatus(1240, 1850)).toEqual({
      kind: "on_track",
      remaining: 610,
    });
  });
});

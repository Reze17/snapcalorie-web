import { describe, expect, it } from "vitest";
import { computeAbsoluteMacros, scaleValue } from "./portion-scaling";

describe("scaleValue", () => {
  it("implements value_new = value_0 * (m_new / m_0)", () => {
    expect(scaleValue(100, 200, 400)).toBe(200); // doubling the baseline
    expect(scaleValue(50, 100, 50)).toBe(25); // halving
    expect(scaleValue(30, 100, 100)).toBe(30); // no change
  });

  it("guards against a zero baseline (m_0 = 0)", () => {
    expect(() => scaleValue(100, 0, 50)).toThrow(/zero baseline/i);
  });

  it("rounds to 2 decimal places, half-up", () => {
    expect(scaleValue(1, 3, 1)).toBe(0.33); // 0.3333... -> 0.33
    expect(scaleValue(10, 3, 1)).toBe(3.33); // 3.3333... -> 3.33
  });

  it("scales down to zero when the new portion is zero", () => {
    expect(scaleValue(165, 100, 0)).toBe(0);
  });
});

describe("computeAbsoluteMacros", () => {
  const chickenPer100g = { calories: 165, protein: 31, carbs: 0, fat: 3.6 };

  it("scales 180g -> 240g proportionally across all four macros", () => {
    const at180 = computeAbsoluteMacros(chickenPer100g, 180);
    const at240 = computeAbsoluteMacros(chickenPer100g, 240);

    expect(at180).toEqual({
      calories: 297,
      protein: 55.8,
      carbs: 0,
      fat: 6.48,
    });
    expect(at240).toEqual({
      calories: 396,
      protein: 74.4,
      carbs: 0,
      fat: 8.64,
    });

    // Every macro scales by the same 240/180 = 4/3 ratio.
    const ratio = 240 / 180;
    expect(at240.calories).toBeCloseTo(at180.calories * ratio, 1);
    expect(at240.protein).toBeCloseTo(at180.protein * ratio, 1);
    expect(at240.fat).toBeCloseTo(at180.fat * ratio, 1);
  });

  it("recomputes from the fixed per100g baseline, so repeated edits don't compound rounding", () => {
    // Simulate a user dragging the stepper through several values — each
    // step recomputes from the same per100g baseline, not from the
    // previous (already-rounded) displayed value.
    const grams = [180, 181, 182, 240];
    const results = grams.map((g) => computeAbsoluteMacros(chickenPer100g, g));
    const direct240 = computeAbsoluteMacros(chickenPer100g, 240);

    expect(results[results.length - 1]).toEqual(direct240);
  });

  it("handles a food with zero carbs/fat without dividing by zero", () => {
    const result = computeAbsoluteMacros(chickenPer100g, 50);
    expect(result.carbs).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { normalizeAnalysisResult, normalizeDetectedFood } from "./normalize";
import type { DetectedFood } from "./types";

const sample: DetectedFood = {
  foodName: "Grilled chicken breast",
  portionGrams: 180,
  calories: 297,
  protein: 55.8,
  carbs: 0,
  fat: 6.48,
  confidence: 0.91,
  alternatives: [],
  per100g: { calories: 165, protein: 31, carbs: 0, fat: 3.6 },
};

describe("normalizeDetectedFood", () => {
  it("maps to meal_items shape as fixed-point strings at 2 decimal places", () => {
    expect(normalizeDetectedFood(sample)).toEqual({
      foodName: "Grilled chicken breast",
      portionGrams: "180.00",
      calories: "297.00",
      protein: "55.80",
      carbs: "0.00",
      fat: "6.48",
      aiConfidence: "0.91",
      isUserEdited: false,
    });
  });

  it("clamps out-of-range confidence into [0, 1] before rounding", () => {
    expect(
      normalizeDetectedFood({ ...sample, confidence: 1.4 }).aiConfidence,
    ).toBe("1.00");
    expect(
      normalizeDetectedFood({ ...sample, confidence: -0.2 }).aiConfidence,
    ).toBe("0.00");
  });

  it("rounds macro values half-up to the column scale", () => {
    expect(normalizeDetectedFood({ ...sample, calories: 6.484 }).calories).toBe(
      "6.48",
    );
    expect(normalizeDetectedFood({ ...sample, calories: 6.486 }).calories).toBe(
      "6.49",
    );
  });

  it("defaults isUserEdited to false for a fresh AI detection", () => {
    expect(normalizeDetectedFood(sample).isUserEdited).toBe(false);
  });

  it("sets isUserEdited to true when the caller marks the item as edited", () => {
    expect(normalizeDetectedFood(sample, true).isUserEdited).toBe(true);
  });
});

describe("normalizeAnalysisResult", () => {
  it("normalizes every item in the result, preserving order", () => {
    const result = normalizeAnalysisResult({
      items: [sample, { ...sample, foodName: "Broccoli, steamed" }],
      modelVersion: "mock-vision-v1",
      processingMs: 10,
    });

    expect(result).toHaveLength(2);
    expect(result[0].foodName).toBe("Grilled chicken breast");
    expect(result[1].foodName).toBe("Broccoli, steamed");
  });

  it("returns an empty array for an empty analysis result", () => {
    const result = normalizeAnalysisResult({
      items: [],
      modelVersion: "mock-vision-v1",
      processingMs: 10,
    });
    expect(result).toEqual([]);
  });
});

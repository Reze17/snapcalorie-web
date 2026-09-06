import { describe, expect, it } from "vitest";
import { buildAccuracyReport, scoreCase } from "./accuracy-scoring";

describe("scoreCase", () => {
  it("matches an expected food found anywhere in the top-3 detected foods", () => {
    const result = scoreCase({
      id: "case-1",
      expectedFoods: ["Chicken"],
      detectedFoods: ["Grilled chicken breast", "White rice", "Broccoli"],
    });
    expect(result.matchedCount).toBe(1);
    expect(result.totalExpected).toBe(1);
  });

  it("matches case-insensitively and ignoring punctuation", () => {
    const result = scoreCase({
      id: "case-2",
      expectedFoods: ["CHICKEN, GRILLED"],
      detectedFoods: ["grilled chicken"],
    });
    expect(result.matchedCount).toBe(1);
  });

  it("does not match an expected food absent from the top-3", () => {
    const result = scoreCase({
      id: "case-3",
      expectedFoods: ["Sushi roll"],
      detectedFoods: ["Grilled chicken breast", "White rice", "Broccoli"],
    });
    expect(result.matchedCount).toBe(0);
    expect(result.totalExpected).toBe(1);
  });

  it("only considers the first 3 detected foods, even if more are provided", () => {
    const result = scoreCase({
      id: "case-4",
      expectedFoods: ["Sushi"],
      detectedFoods: ["Chicken", "Rice", "Broccoli", "Sushi"], // Sushi is 4th
    });
    expect(result.matchedCount).toBe(0);
    expect(result.topDetected).toEqual(["Chicken", "Rice", "Broccoli"]);
  });

  it("scores each expected food independently — partial matches count partially", () => {
    const result = scoreCase({
      id: "case-5",
      expectedFoods: ["Chicken", "Sushi"],
      detectedFoods: ["Grilled chicken breast", "White rice", "Broccoli"],
    });
    expect(result.matchedCount).toBe(1);
    expect(result.totalExpected).toBe(2);
  });
});

describe("buildAccuracyReport", () => {
  it("aggregates matched/total across all cases into one overall percentage", () => {
    const report = buildAccuracyReport([
      {
        id: "case-1",
        expectedFoods: ["Chicken", "Rice", "Broccoli"],
        detectedFoods: ["Grilled chicken breast", "White rice", "Broccoli"],
      },
      {
        id: "case-2",
        expectedFoods: ["Sushi", "Miso soup"],
        detectedFoods: ["Grilled chicken breast", "White rice", "Broccoli"],
      },
    ]);

    expect(report.totalExpected).toBe(5);
    expect(report.totalMatched).toBe(3);
    expect(report.accuracyPercentage).toBe(60);
  });

  it("returns 0% (not NaN) for an empty case list", () => {
    const report = buildAccuracyReport([]);
    expect(report.accuracyPercentage).toBe(0);
    expect(report.totalExpected).toBe(0);
  });

  it("reports 100% when every expected food is found in every case", () => {
    const report = buildAccuracyReport([
      {
        id: "case-1",
        expectedFoods: ["Chicken", "Rice"],
        detectedFoods: ["Chicken", "Rice", "Broccoli"],
      },
    ]);
    expect(report.accuracyPercentage).toBe(100);
  });
});

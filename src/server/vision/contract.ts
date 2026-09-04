import { describe, expect, it } from "vitest";
import type {
  AnalysisResult,
  DetectedFood,
  FoodSearchResult,
  INutritionVisionService,
  MacroProfile,
} from "./types";

function expectMacroProfile(profile: MacroProfile) {
  expect(typeof profile.calories).toBe("number");
  expect(typeof profile.protein).toBe("number");
  expect(typeof profile.carbs).toBe("number");
  expect(typeof profile.fat).toBe("number");
}

function expectDetectedFood(item: DetectedFood) {
  expect(typeof item.foodName).toBe("string");
  expect(item.foodName.length).toBeGreaterThan(0);
  expect(item.portionGrams).toBeGreaterThan(0);
  expect(item.confidence).toBeGreaterThanOrEqual(0);
  expect(item.confidence).toBeLessThanOrEqual(1);
  expectMacroProfile(item);
  expectMacroProfile(item.per100g);
  expect(Array.isArray(item.alternatives)).toBe(true);
  for (const alt of item.alternatives) {
    expect(typeof alt.foodName).toBe("string");
    expect(alt.confidence).toBeGreaterThanOrEqual(0);
    expect(alt.confidence).toBeLessThanOrEqual(1);
    expectMacroProfile(alt.per100g);
  }
}

function expectAnalysisResult(result: AnalysisResult) {
  expect(Array.isArray(result.items)).toBe(true);
  result.items.forEach(expectDetectedFood);
  expect(typeof result.modelVersion).toBe("string");
  expect(result.modelVersion.length).toBeGreaterThan(0);
  expect(result.processingMs).toBeGreaterThanOrEqual(0);
}

function expectFoodSearchResult(result: FoodSearchResult) {
  expect(typeof result.foodName).toBe("string");
  expect(result.foodName.length).toBeGreaterThan(0);
  expectMacroProfile(result.per100g);
}

/**
 * Shared contract suite: run this against every INutritionVisionService
 * implementation so they all uphold the same provider-agnostic guarantees.
 */
export function runVisionServiceContractTests(
  label: string,
  createService: () => INutritionVisionService,
) {
  describe(`INutritionVisionService contract: ${label}`, () => {
    it("analyzeMealImage resolves a well-formed AnalysisResult", async () => {
      const service = createService();
      const result = await service.analyzeMealImage({
        imageBuffer: Buffer.from("fake-image-bytes"),
        mimeType: "image/jpeg",
      });
      expectAnalysisResult(result);
    });

    it("searchFoods resolves an array of well-formed results", async () => {
      const service = createService();
      const results = await service.searchFoods("chicken");
      expect(Array.isArray(results)).toBe(true);
      results.forEach(expectFoodSearchResult);
    });

    it("searchFoods resolves an empty array for an empty query", async () => {
      const service = createService();
      const results = await service.searchFoods("");
      expect(results).toEqual([]);
    });

    it("getFoodByName resolves null for a food that does not exist", async () => {
      const service = createService();
      const result = await service.getFoodByName(
        "zzz-definitely-not-a-real-food-zzz",
      );
      expect(result).toBeNull();
    });
  });
}

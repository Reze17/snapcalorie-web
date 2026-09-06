import { afterEach, describe, expect, it, vi } from "vitest";
import type { FoodSearchResult, INutritionVisionService } from "./types";
import { clearSearchCache, withSearchCache } from "./search-cache";

function makeFakeService(results: FoodSearchResult[]) {
  const searchFoods = vi.fn().mockResolvedValue(results);
  const service: INutritionVisionService = {
    analyzeMealImage: vi.fn(),
    getFoodByName: vi.fn(),
    searchFoods,
  };
  return { service, searchFoods };
}

describe("withSearchCache", () => {
  afterEach(() => {
    clearSearchCache();
  });

  it("only calls the underlying provider once for repeated identical queries", async () => {
    const { service, searchFoods } = makeFakeService([
      {
        foodName: "Rice",
        per100g: { calories: 130, protein: 2.7, carbs: 28, fat: 0.3 },
      },
    ]);
    const cached = withSearchCache(service);

    const first = await cached.searchFoods("rice");
    const second = await cached.searchFoods("rice");

    expect(first).toEqual(second);
    expect(searchFoods).toHaveBeenCalledTimes(1);
  });

  it("treats different queries (case/whitespace-normalized) as distinct cache entries", async () => {
    const { service, searchFoods } = makeFakeService([]);
    const cached = withSearchCache(service);

    await cached.searchFoods("chicken");
    await cached.searchFoods("Chicken");
    await cached.searchFoods("  chicken  ");
    await cached.searchFoods("salmon");

    // "chicken" / "Chicken" / "  chicken  " normalize to the same key; "salmon" is distinct.
    expect(searchFoods).toHaveBeenCalledTimes(2);
  });

  it("delegates analyzeMealImage and getFoodByName straight through, uncached", async () => {
    const { service } = makeFakeService([]);
    const cached = withSearchCache(service);

    await cached.analyzeMealImage({
      imageBuffer: Buffer.from(""),
      mimeType: "image/jpeg",
    });
    await cached.getFoodByName("Rice");

    expect(service.analyzeMealImage).toHaveBeenCalledTimes(1);
    expect(service.getFoodByName).toHaveBeenCalledTimes(1);
  });
});

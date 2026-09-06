import type { FoodSearchResult, INutritionVisionService } from "./types";

// FR-05's manual "search foods" fallback is the one repeat-lookup path in
// this app (the vision model returns per100g directly on every analysis,
// by design — there's no separate nutrition-DB lookup to cache). A short
// TTL is enough: food search results are effectively static within a
// session, and this only needs to shave repeat round-trips, not serve as
// a source of truth. Module-level (not per-request), since it's meant to
// help the next user who searches the same term too.
const CACHE_TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  results: FoodSearchResult[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Wraps any INutritionVisionService with a TTL cache on searchFoods — applies uniformly to mock and real providers. */
export function withSearchCache(
  service: INutritionVisionService,
): INutritionVisionService {
  return {
    analyzeMealImage: (input) => service.analyzeMealImage(input),
    getFoodByName: (name) => service.getFoodByName(name),
    async searchFoods(query: string): Promise<FoodSearchResult[]> {
      const key = query.trim().toLowerCase();
      const cached = cache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.results;
      }
      const results = await service.searchFoods(query);
      cache.set(key, { results, expiresAt: Date.now() + CACHE_TTL_MS });
      return results;
    },
  };
}

/** Test-only escape hatch — production code never needs to clear this. */
export function clearSearchCache(): void {
  cache.clear();
}

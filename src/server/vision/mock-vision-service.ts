import { VisionServiceTimeoutError } from "./errors";
import { round2 } from "./round";
import type {
  AnalysisResult,
  AnalyzeMealImageInput,
  DetectedFood,
  DetectedFoodAlternative,
  FoodSearchResult,
  INutritionVisionService,
  MacroProfile,
} from "./types";

export type MockVisionScenario =
  "default" | "lowConfidence" | "singleItem" | "empty" | "timeout";

export interface MockVisionServiceOptions {
  scenario?: MockVisionScenario;
  /** Artificial delay in ms, applied before resolving (or before throwing, for "timeout"). */
  latencyMs?: number;
}

const DEFAULT_TIMEOUT_DELAY_MS = 5000;

// Real-world-plausible per-100g macros (USDA-ballpark), used as the fixed
// baseline for both the deterministic mock plate and the manual-search
// fallback database.
const CHICKEN_PER_100G: MacroProfile = {
  calories: 165,
  protein: 31,
  carbs: 0,
  fat: 3.6,
};
const RICE_PER_100G: MacroProfile = {
  calories: 130,
  protein: 2.7,
  carbs: 28,
  fat: 0.3,
};
const BROCCOLI_PER_100G: MacroProfile = {
  calories: 35,
  protein: 2.4,
  carbs: 7.2,
  fat: 0.4,
};

function scale(
  per100g: MacroProfile,
  grams: number,
): Omit<MacroProfile, never> {
  const factor = grams / 100;
  return {
    calories: round2(per100g.calories * factor),
    protein: round2(per100g.protein * factor),
    carbs: round2(per100g.carbs * factor),
    fat: round2(per100g.fat * factor),
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface FoodFixture {
  foodName: string;
  grams: number;
  per100g: MacroProfile;
  confidence: number;
  lowConfidence: number;
  alternatives: DetectedFoodAlternative[];
}

const FIXTURES: FoodFixture[] = [
  {
    foodName: "Grilled chicken breast",
    grams: 180,
    per100g: CHICKEN_PER_100G,
    confidence: 0.91,
    lowConfidence: 0.55,
    alternatives: [
      {
        foodName: "Grilled turkey breast",
        confidence: 0.35,
        per100g: { calories: 150, protein: 29, carbs: 0, fat: 2 },
      },
      {
        foodName: "Baked pork tenderloin",
        confidence: 0.28,
        per100g: { calories: 143, protein: 26, carbs: 0, fat: 3.5 },
      },
      {
        foodName: "Grilled tofu",
        confidence: 0.15,
        per100g: { calories: 76, protein: 8, carbs: 1.9, fat: 4.8 },
      },
    ],
  },
  {
    foodName: "White rice, cooked",
    grams: 200,
    per100g: RICE_PER_100G,
    confidence: 0.88,
    lowConfidence: 0.52,
    alternatives: [
      {
        foodName: "Brown rice, cooked",
        confidence: 0.33,
        per100g: { calories: 123, protein: 2.7, carbs: 26, fat: 1 },
      },
      {
        foodName: "Quinoa, cooked",
        confidence: 0.24,
        per100g: { calories: 120, protein: 4.4, carbs: 21, fat: 1.9 },
      },
      {
        foodName: "Couscous, cooked",
        confidence: 0.13,
        per100g: { calories: 112, protein: 3.8, carbs: 23, fat: 0.2 },
      },
    ],
  },
  {
    foodName: "Broccoli, steamed",
    grams: 100,
    per100g: BROCCOLI_PER_100G,
    confidence: 0.94,
    lowConfidence: 0.6,
    alternatives: [
      {
        foodName: "Steamed green beans",
        confidence: 0.31,
        per100g: { calories: 35, protein: 1.8, carbs: 7.9, fat: 0.1 },
      },
      {
        foodName: "Roasted cauliflower",
        confidence: 0.22,
        per100g: { calories: 25, protein: 2, carbs: 5, fat: 0.3 },
      },
      {
        foodName: "Steamed asparagus",
        confidence: 0.12,
        per100g: { calories: 20, protein: 2.2, carbs: 3.9, fat: 0.1 },
      },
    ],
  },
];

function buildItem(fixture: FoodFixture, lowConfidence: boolean): DetectedFood {
  return {
    foodName: fixture.foodName,
    portionGrams: fixture.grams,
    ...scale(fixture.per100g, fixture.grams),
    confidence: lowConfidence ? fixture.lowConfidence : fixture.confidence,
    alternatives: lowConfidence ? fixture.alternatives : [],
    per100g: fixture.per100g,
  };
}

const FOOD_DATABASE: FoodSearchResult[] = [
  { foodName: "Grilled chicken breast", per100g: CHICKEN_PER_100G },
  { foodName: "White rice, cooked", per100g: RICE_PER_100G },
  { foodName: "Broccoli, steamed", per100g: BROCCOLI_PER_100G },
  {
    foodName: "Brown rice, cooked",
    per100g: { calories: 123, protein: 2.7, carbs: 26, fat: 1 },
  },
  {
    foodName: "Banana",
    per100g: { calories: 89, protein: 1.1, carbs: 23, fat: 0.3 },
  },
  {
    foodName: "Large egg, boiled",
    per100g: { calories: 155, protein: 13, carbs: 1.1, fat: 11 },
  },
  {
    foodName: "Salmon, baked",
    per100g: { calories: 208, protein: 20, carbs: 0, fat: 13 },
  },
  {
    foodName: "Greek yogurt, plain",
    per100g: { calories: 59, protein: 10, carbs: 3.6, fat: 0.4 },
  },
];

/**
 * Deterministic, network-free INutritionVisionService for Phases 4-8 to
 * build and test against. Scenario/latency can be forced via constructor
 * options (preferred, e.g. in tests) or the VISION_MOCK_SCENARIO /
 * VISION_MOCK_LATENCY_MS env vars (convenient for manual/local QA).
 */
export class MockVisionService implements INutritionVisionService {
  private readonly scenario: MockVisionScenario;
  private readonly latencyMs: number;

  constructor(options: MockVisionServiceOptions = {}) {
    this.scenario =
      options.scenario ??
      (process.env.VISION_MOCK_SCENARIO as MockVisionScenario | undefined) ??
      "default";
    this.latencyMs =
      options.latencyMs ?? Number(process.env.VISION_MOCK_LATENCY_MS ?? 0);
  }

  async analyzeMealImage(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature required by INutritionVisionService; the mock ignores the actual image
    input: AnalyzeMealImageInput,
  ): Promise<AnalysisResult> {
    const start = Date.now();

    if (this.scenario === "timeout") {
      await delay(this.latencyMs || DEFAULT_TIMEOUT_DELAY_MS);
      throw new VisionServiceTimeoutError();
    }

    if (this.latencyMs > 0) {
      await delay(this.latencyMs);
    }

    return {
      items: this.buildItems(),
      modelVersion: "mock-vision-v1",
      processingMs: Date.now() - start,
    };
  }

  private buildItems(): DetectedFood[] {
    switch (this.scenario) {
      case "empty":
        return [];
      case "singleItem":
        return [buildItem(FIXTURES[0], false)];
      case "lowConfidence":
        return FIXTURES.map((fixture) => buildItem(fixture, true));
      case "default":
      default:
        return FIXTURES.map((fixture) => buildItem(fixture, false));
    }
  }

  async searchFoods(query: string): Promise<FoodSearchResult[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return FOOD_DATABASE.filter((food) =>
      food.foodName.toLowerCase().includes(q),
    );
  }

  async getFoodByName(name: string): Promise<FoodSearchResult | null> {
    const target = name.trim().toLowerCase();
    return (
      FOOD_DATABASE.find((food) => food.foodName.toLowerCase() === target) ??
      null
    );
  }
}

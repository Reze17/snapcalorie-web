// Provider-agnostic vision/nutrition contract (FRD §6 "Provider Decoupling").
// Nothing in this file may reference a specific vendor's SDK types — every
// implementation (mock, openai, anthropic, google, ...) normalizes into
// this shape.

export interface MacroProfile {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface DetectedFoodAlternative {
  foodName: string;
  confidence: number; // 0.00 - 1.00
  per100g: MacroProfile;
}

export interface DetectedFood {
  foodName: string;
  portionGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: number; // 0.00 - 1.00
  alternatives: DetectedFoodAlternative[];
  // Required on every item: Phase 6's portion-edit rescaling
  // (value_new = value_0 * (m_new / m_0), per CLAUDE.md) needs a stable
  // per-100g baseline to scale from, independent of the detected portion.
  per100g: MacroProfile;
}

export interface AnalysisResult {
  items: DetectedFood[];
  modelVersion: string;
  processingMs: number;
}

export interface AnalyzeMealImageInput {
  imageBuffer: Buffer;
  mimeType: string;
}

export interface FoodSearchResult {
  foodName: string;
  per100g: MacroProfile;
}

export interface INutritionVisionService {
  analyzeMealImage(input: AnalyzeMealImageInput): Promise<AnalysisResult>;
  /** Manual search fallback for FR-05 (e.g. low-confidence or no-detection review). */
  searchFoods(query: string): Promise<FoodSearchResult[]>;
  getFoodByName(name: string): Promise<FoodSearchResult | null>;
}

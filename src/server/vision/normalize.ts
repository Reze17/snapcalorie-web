import Decimal from "decimal.js";
import type { AnalysisResult, DetectedFood } from "./types";

// meal_items column scales (see src/db/schema.ts): portion_grams(6,2),
// calories(6,2), protein/carbs/fat(5,2), ai_confidence(3,2). Scale is 2
// decimal places across the board, so a single rounding helper covers all
// of them; precision (total digits) is enforced by the DB, not here.
const COLUMN_SCALE = 2;

export interface NormalizedMealItem {
  foodName: string;
  portionGrams: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  aiConfidence: string;
  isUserEdited: boolean;
}

function round(value: number): string {
  return new Decimal(value)
    .toDecimalPlaces(COLUMN_SCALE, Decimal.ROUND_HALF_UP)
    .toFixed(COLUMN_SCALE);
}

function clampConfidence(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function normalizeDetectedFood(item: DetectedFood): NormalizedMealItem {
  return {
    foodName: item.foodName,
    portionGrams: round(item.portionGrams),
    calories: round(item.calories),
    protein: round(item.protein),
    carbs: round(item.carbs),
    fat: round(item.fat),
    aiConfidence: round(clampConfidence(item.confidence)),
    isUserEdited: false,
  };
}

export function normalizeAnalysisResult(
  result: AnalysisResult,
): NormalizedMealItem[] {
  return result.items.map(normalizeDetectedFood);
}

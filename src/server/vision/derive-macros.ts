import { round2 } from "./round";
import type { RawDetectedFood } from "./schema";
import type { DetectedFood } from "./types";

/**
 * The ONE place absolute macros are derived from a provider's raw output.
 * Every real provider (Anthropic, Ollama, ...) is asked for portionGrams +
 * confidence + per100g only — never absolute calories/protein/carbs/fat —
 * and this is what turns that into the DetectedFood shape the rest of the
 * app trusts. Never let a provider compute or report absolute macros
 * itself; this is the non-negotiable rule from CLAUDE.md's Phase 5 section.
 */
export function toDetectedFood(raw: RawDetectedFood): DetectedFood {
  const factor = raw.portionGrams / 100;
  return {
    foodName: raw.foodName,
    portionGrams: raw.portionGrams,
    calories: round2(raw.per100g.calories * factor),
    protein: round2(raw.per100g.protein * factor),
    carbs: round2(raw.per100g.carbs * factor),
    fat: round2(raw.per100g.fat * factor),
    confidence: raw.confidence,
    alternatives: raw.alternatives,
    per100g: raw.per100g,
  };
}

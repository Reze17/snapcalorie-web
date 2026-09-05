import { z } from "zod";

// Validates raw structured output from a real (LLM-backed) provider before
// it's trusted. Deliberately does NOT include the top-level absolute
// calories/protein/carbs/fat that DetectedFood has — those are derived
// deterministically from per100g * (portionGrams / 100) in
// anthropic-vision-service.ts rather than trusted from model arithmetic.

export const macroProfileSchema = z.object({
  calories: z.number().nonnegative(),
  protein: z.number().nonnegative(),
  carbs: z.number().nonnegative(),
  fat: z.number().nonnegative(),
});

export const rawAlternativeSchema = z.object({
  foodName: z.string().min(1),
  confidence: z.number().min(0).max(1),
  per100g: macroProfileSchema,
});

export const rawDetectedFoodSchema = z.object({
  foodName: z.string().min(1),
  portionGrams: z.number().positive(),
  confidence: z.number().min(0).max(1),
  per100g: macroProfileSchema,
  alternatives: z.array(rawAlternativeSchema),
});

export const rawAnalysisSchema = z.object({
  items: z.array(rawDetectedFoodSchema),
});

export type RawDetectedFood = z.infer<typeof rawDetectedFoodSchema>;
export type RawAnalysis = z.infer<typeof rawAnalysisSchema>;

export const foodSearchResultSchema = z.object({
  foodName: z.string().min(1),
  per100g: macroProfileSchema,
});

export const foodSearchListSchema = z.object({
  results: z.array(foodSearchResultSchema),
});

export type FoodSearchList = z.infer<typeof foodSearchListSchema>;

import { z } from "zod";

// A storage key is client-supplied (it's an HTTP query param / server action
// arg), so validate its *shape* here — assertOwnedKey (analyze/actions.ts)
// still does the actual ownership check; this is defense-in-depth against a
// malformed/oversized value reaching S3 at all, per the Phase 10 security
// pass ("validate and sanitise all inputs with zod at every route boundary").
export const objectKeySchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^users\/[^/]+\/meals\/[^/]+\.jpg$/, "Invalid photo key format");

export const searchQuerySchema = z.string().trim().min(1).max(100);

const macroProfileSchema = z.object({
  calories: z.number().finite().min(0).max(99999),
  protein: z.number().finite().min(0).max(9999),
  carbs: z.number().finite().min(0).max(9999),
  fat: z.number().finite().min(0).max(9999),
});

const detectedFoodAlternativeSchema = z.object({
  foodName: z.string().min(1).max(150),
  confidence: z.number().min(0).max(1),
  per100g: macroProfileSchema,
});

const detectedFoodSchema = z.object({
  foodName: z.string().min(1).max(150),
  portionGrams: z.number().finite().positive().max(5000),
  calories: z.number().finite().min(0).max(99999),
  protein: z.number().finite().min(0).max(9999),
  carbs: z.number().finite().min(0).max(9999),
  fat: z.number().finite().min(0).max(9999),
  confidence: z.number().min(0).max(1),
  alternatives: z.array(detectedFoodAlternativeSchema).max(10),
  per100g: macroProfileSchema,
});

export const saveMealItemsSchema = z
  .array(
    z.object({
      item: detectedFoodSchema,
      isUserEdited: z.boolean(),
    }),
  )
  .min(1, "Add at least one item before saving.")
  .max(50, "Too many items in one meal.");

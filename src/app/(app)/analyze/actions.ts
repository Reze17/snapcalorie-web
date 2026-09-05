"use server";

import Decimal from "decimal.js";
import { getEffectiveUser } from "@/server/dev-bypass";
import { createMealEntryWithItems } from "@/server/repositories/meal-entries";
import { getObjectBuffer } from "@/server/storage/objects";
import {
  VisionAnalysisFailedError,
  VisionServiceTimeoutError,
} from "@/server/vision/errors";
import { getVisionService } from "@/server/vision/factory";
import { normalizeDetectedFood } from "@/server/vision/normalize";
import type {
  AnalysisResult,
  DetectedFood,
  FoodSearchResult,
} from "@/server/vision/types";

export type AnalysisOutcome =
  | { status: "ok"; result: AnalysisResult }
  | { status: "failed"; message: string };

/** Object keys are user-controlled query params — always verify ownership before touching storage. */
function assertOwnedKey(key: string, userId: string): void {
  if (!key.startsWith(`users/${userId}/meals/`)) {
    throw new Error("You don't have access to that photo.");
  }
}

export async function runAnalysis(key: string): Promise<AnalysisOutcome> {
  const user = await getEffectiveUser();
  if (!user) {
    throw new Error("You must be signed in.");
  }
  assertOwnedKey(key, user.id);

  try {
    const { buffer, contentType } = await getObjectBuffer(key);
    const vision = getVisionService();
    const result = await vision.analyzeMealImage({
      imageBuffer: buffer,
      mimeType: contentType,
    });
    return { status: "ok", result };
  } catch (err) {
    if (err instanceof VisionServiceTimeoutError) {
      return {
        status: "failed",
        message:
          "The vision service took too long to respond. You can retry, or search for foods manually.",
      };
    }
    if (err instanceof VisionAnalysisFailedError) {
      return {
        status: "failed",
        message:
          "Couldn't read this plate. You can retry, or search for foods manually.",
      };
    }
    return {
      status: "failed",
      message:
        "Something went wrong analyzing this photo. You can retry, or search for foods manually.",
    };
  }
}

export async function searchFoodsAction(
  query: string,
): Promise<FoodSearchResult[]> {
  const user = await getEffectiveUser();
  if (!user) {
    throw new Error("You must be signed in.");
  }
  const vision = getVisionService();
  return vision.searchFoods(query);
}

export interface SaveMealItem {
  item: DetectedFood;
  isUserEdited: boolean;
}

export type SaveMealResult =
  { success: true } | { success: false; error: string };

/**
 * Persists the reviewed meal in one transaction (createMealEntryWithItems
 * also triggers recalculateDailySummary for the affected local day) and
 * rounds every value to the DB column scale via normalizeDetectedFood.
 * Entry-level totals are the exact Decimal sum of the (unrounded) items,
 * then rounded once — never a sum of already-rounded per-item values.
 */
export async function saveMealAction(
  objectKey: string,
  items: SaveMealItem[],
): Promise<SaveMealResult> {
  const user = await getEffectiveUser();
  if (!user) {
    return { success: false, error: "You must be signed in." };
  }
  assertOwnedKey(objectKey, user.id);

  if (items.length === 0) {
    return { success: false, error: "Add at least one item before saving." };
  }

  const totals = items.reduce(
    (acc, { item }) => ({
      calories: acc.calories.plus(item.calories),
      protein: acc.protein.plus(item.protein),
      carbs: acc.carbs.plus(item.carbs),
      fat: acc.fat.plus(item.fat),
    }),
    {
      calories: new Decimal(0),
      protein: new Decimal(0),
      carbs: new Decimal(0),
      fat: new Decimal(0),
    },
  );

  const roundTo2 = (value: Decimal) =>
    value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);

  try {
    await createMealEntryWithItems({
      userId: user.id,
      imageStoragePath: objectKey,
      totalCalories: roundTo2(totals.calories),
      totalProtein: roundTo2(totals.protein),
      totalCarbs: roundTo2(totals.carbs),
      totalFat: roundTo2(totals.fat),
      loggedAt: new Date(),
      items: items.map(({ item, isUserEdited }) =>
        normalizeDetectedFood(item, isUserEdited),
      ),
    });
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to save meal.",
    };
  }
}

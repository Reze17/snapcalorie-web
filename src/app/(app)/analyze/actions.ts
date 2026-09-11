"use server";

import Decimal from "decimal.js";
import { getEffectiveUser } from "@/server/dev-bypass";
import { logEvent, recordLatency } from "@/server/lib/log";
import { checkRateLimit } from "@/server/lib/rate-limit";
import { instantToLocalDate } from "@/server/lib/timezone";
import { getDailySummary } from "@/server/repositories/daily-summaries";
import { createMealEntryWithItems } from "@/server/repositories/meal-entries";
import { getUserById } from "@/server/repositories/users";
import { getObjectBuffer } from "@/server/storage/objects";
import {
  objectKeySchema,
  saveMealItemsSchema,
  searchQuerySchema,
} from "@/server/validation/analyze";
import {
  VisionAnalysisFailedError,
  VisionServiceTimeoutError,
} from "@/server/vision/errors";
import { getVisionService } from "@/server/vision/factory";
import { normalizeDetectedFood } from "@/server/vision/normalize";
import { withSearchCache } from "@/server/vision/search-cache";
import type {
  AnalysisResult,
  DetectedFood,
  FoodSearchResult,
} from "@/server/vision/types";

export type AnalysisOutcome =
  | { status: "ok"; result: AnalysisResult }
  | { status: "failed"; message: string };

export interface TodayBudget {
  consumedToday: number;
  dailyTarget: number;
}

/**
 * What the review screen needs to show "after this meal: N kcal
 * remaining" (FR: the AI scanner should connect straight to the
 * personalized goal, not just report calories in isolation). A user with
 * no goal set yet still gets the default daily_calorie_target (2000).
 */
export async function getTodayBudget(): Promise<TodayBudget> {
  const user = await getEffectiveUser();
  if (!user) {
    throw new Error("You must be signed in.");
  }
  const dbUser = await getUserById(user.id);
  if (!dbUser) {
    throw new Error("You must be signed in.");
  }
  const todayLocal = instantToLocalDate(new Date(), dbUser.timezone);
  const summary = await getDailySummary(user.id, todayLocal);
  return {
    consumedToday: summary ? Number(summary.consumedCalories) : 0,
    dailyTarget: summary ? summary.targetCalories : dbUser.dailyCalorieTarget,
  };
}

const ANALYSIS_RATE_LIMIT = 30;
const ANALYSIS_RATE_WINDOW_SECONDS = 60 * 60; // 1 hour, per FRD §6

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
  const parsedKey = objectKeySchema.safeParse(key);
  if (!parsedKey.success) {
    return { status: "failed", message: "That photo link looks invalid." };
  }
  assertOwnedKey(parsedKey.data, user.id);

  const rateLimit = await checkRateLimit(
    `analysis:${user.id}`,
    ANALYSIS_RATE_LIMIT,
    ANALYSIS_RATE_WINDOW_SECONDS,
  );
  if (!rateLimit.allowed) {
    return {
      status: "failed",
      message: `You've hit the analysis limit for this hour (${ANALYSIS_RATE_LIMIT}/hour). Try again after ${rateLimit.resetAt.toLocaleTimeString()}.`,
    };
  }

  const start = Date.now();
  try {
    const { buffer, contentType } = await getObjectBuffer(parsedKey.data);
    const vision = getVisionService();
    const result = await vision.analyzeMealImage({
      imageBuffer: buffer,
      mimeType: contentType,
    });
    recordLatency("vision_inference", Date.now() - start);
    return { status: "ok", result };
  } catch (err) {
    recordLatency("vision_inference_failed", Date.now() - start);
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
  const parsedQuery = searchQuerySchema.safeParse(query);
  if (!parsedQuery.success) {
    return [];
  }
  const vision = withSearchCache(getVisionService());
  return vision.searchFoods(parsedQuery.data);
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
  const parsedKey = objectKeySchema.safeParse(objectKey);
  if (!parsedKey.success) {
    return { success: false, error: "That photo link looks invalid." };
  }
  assertOwnedKey(parsedKey.data, user.id);

  const parsedItems = saveMealItemsSchema.safeParse(items);
  if (!parsedItems.success) {
    return {
      success: false,
      error: parsedItems.error.issues[0]?.message ?? "Invalid meal items.",
    };
  }

  const totals = parsedItems.data.reduce(
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
    const normalizeStart = Date.now();
    const normalizedItems = parsedItems.data.map(({ item, isUserEdited }) =>
      normalizeDetectedFood(item, isUserEdited),
    );
    recordLatency("normalize", Date.now() - normalizeStart);

    const dbWriteStart = Date.now();
    const entry = await createMealEntryWithItems({
      userId: user.id,
      imageStoragePath: parsedKey.data,
      totalCalories: roundTo2(totals.calories),
      totalProtein: roundTo2(totals.protein),
      totalCarbs: roundTo2(totals.carbs),
      totalFat: roundTo2(totals.fat),
      loggedAt: new Date(),
      items: normalizedItems,
    });
    recordLatency("db_write", Date.now() - dbWriteStart, entry.entryId);
    return { success: true };
  } catch (err) {
    // Never forward err.message to the client — repository errors can
    // carry internal ids (see meal-entries.ts's "User {id} not found"
    // etc.), which is exactly what the FRD §6 privacy pass rules out.
    logEvent("save_meal_failed", {
      cause: err instanceof Error ? err.message : String(err),
    });
    return { success: false, error: "Failed to save meal." };
  }
}

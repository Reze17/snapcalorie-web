import Decimal from "decimal.js";
import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { mealEntries, mealItems, users } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { instantToLocalDate, localDayRangeUtc } from "@/server/lib/timezone";
import { recalculateDailySummary } from "./daily-summaries";

export interface MealItemInput {
  foodName: string;
  portionGrams: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  aiConfidence?: string | null;
  isUserEdited?: boolean;
}

export interface MealEntryInput {
  userId: string;
  imageStoragePath: string;
  totalCalories: string;
  totalProtein: string;
  totalCarbs: string;
  totalFat: string;
  loggedAt: Date;
  items: MealItemInput[];
}

export interface MealEntryUpdate {
  imageStoragePath?: string;
  totalCalories?: string;
  totalProtein?: string;
  totalCarbs?: string;
  totalFat?: string;
  loggedAt?: Date;
}

async function getUserTimezone(
  executor: DbOrTx,
  userId: string,
): Promise<string> {
  const [user] = await executor
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) {
    throw new Error(`User ${userId} not found`);
  }
  return user.timezone;
}

/** Inserts a meal entry with its items and recalculates that day's summary, all in one transaction. */
export async function createMealEntryWithItems(input: MealEntryInput) {
  return db.transaction(async (tx) => {
    const [entry] = await tx
      .insert(mealEntries)
      .values({
        userId: input.userId,
        imageStoragePath: input.imageStoragePath,
        totalCalories: input.totalCalories,
        totalProtein: input.totalProtein,
        totalCarbs: input.totalCarbs,
        totalFat: input.totalFat,
        loggedAt: input.loggedAt,
      })
      .returning();

    if (input.items.length > 0) {
      await tx.insert(mealItems).values(
        input.items.map((item) => ({
          entryId: entry.entryId,
          foodName: item.foodName,
          portionGrams: item.portionGrams,
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat,
          aiConfidence: item.aiConfidence ?? null,
          isUserEdited: item.isUserEdited ?? false,
        })),
      );
    }

    const timezone = await getUserTimezone(tx, input.userId);
    const localDate = instantToLocalDate(entry.loggedAt, timezone);
    await recalculateDailySummary(tx, input.userId, localDate);

    return entry;
  });
}

/** Fetches a user's meal entries for one local calendar day, newest first. */
export async function getEntriesForUserDay(userId: string, localDate: string) {
  const timezone = await getUserTimezone(db, userId);
  const { startUtc, endUtc } = localDayRangeUtc(timezone, localDate);
  return db
    .select()
    .from(mealEntries)
    .where(
      and(
        eq(mealEntries.userId, userId),
        gte(mealEntries.loggedAt, startUtc),
        lt(mealEntries.loggedAt, endUtc),
      ),
    )
    .orderBy(desc(mealEntries.loggedAt));
}

export interface MealEntryWithItems {
  entry: typeof mealEntries.$inferSelect;
  items: (typeof mealItems.$inferSelect)[];
}

/** Fetches a user's meal entries for one local calendar day, with their items, newest first. */
export async function getEntriesWithItemsForUserDay(
  userId: string,
  localDate: string,
): Promise<MealEntryWithItems[]> {
  const entries = await getEntriesForUserDay(userId, localDate);
  if (entries.length === 0) return [];

  const entryIds = entries.map((entry) => entry.entryId);
  const items = await db
    .select()
    .from(mealItems)
    .where(inArray(mealItems.entryId, entryIds));

  const itemsByEntryId = new Map<string, (typeof mealItems.$inferSelect)[]>();
  for (const item of items) {
    const list = itemsByEntryId.get(item.entryId) ?? [];
    list.push(item);
    itemsByEntryId.set(item.entryId, list);
  }

  return entries.map((entry) => ({
    entry,
    items: itemsByEntryId.get(entry.entryId) ?? [],
  }));
}

/** Fetches one meal entry with its items, or null if it doesn't exist. */
export async function getEntryWithItems(
  entryId: string,
): Promise<MealEntryWithItems | null> {
  const [entry] = await db
    .select()
    .from(mealEntries)
    .where(eq(mealEntries.entryId, entryId));
  if (!entry) return null;

  const items = await db
    .select()
    .from(mealItems)
    .where(eq(mealItems.entryId, entryId));

  return { entry, items };
}

/**
 * Replaces an entry's items wholesale (used by the dashboard's edit view —
 * grams/swap/delete/add all resolve to "here is the new item list"), then
 * recomputes entry-level totals from those items and recalculates the
 * day's summary. logged_at and image_storage_path are untouched, so the
 * entry always stays on the same local day.
 */
export async function updateMealEntryWithItems(
  entryId: string,
  items: MealItemInput[],
) {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(mealEntries)
      .where(eq(mealEntries.entryId, entryId));
    if (!existing) {
      throw new Error(`Meal entry ${entryId} not found`);
    }

    await tx.delete(mealItems).where(eq(mealItems.entryId, entryId));

    if (items.length > 0) {
      await tx.insert(mealItems).values(
        items.map((item) => ({
          entryId,
          foodName: item.foodName,
          portionGrams: item.portionGrams,
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat,
          aiConfidence: item.aiConfidence ?? null,
          isUserEdited: item.isUserEdited ?? false,
        })),
      );
    }

    const totals = items.reduce(
      (acc, item) => ({
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

    const [updated] = await tx
      .update(mealEntries)
      .set({
        totalCalories: roundTo2(totals.calories),
        totalProtein: roundTo2(totals.protein),
        totalCarbs: roundTo2(totals.carbs),
        totalFat: roundTo2(totals.fat),
      })
      .where(eq(mealEntries.entryId, entryId))
      .returning();

    const timezone = await getUserTimezone(tx, updated.userId);
    const localDate = instantToLocalDate(updated.loggedAt, timezone);
    await recalculateDailySummary(tx, updated.userId, localDate);

    return updated;
  });
}

/** Updates a meal entry and recalculates the summary for its old and (if changed) new day. */
export async function updateMealEntry(
  entryId: string,
  updates: MealEntryUpdate,
) {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(mealEntries)
      .where(eq(mealEntries.entryId, entryId));
    if (!existing) {
      throw new Error(`Meal entry ${entryId} not found`);
    }

    const [updated] = await tx
      .update(mealEntries)
      .set(updates)
      .where(eq(mealEntries.entryId, entryId))
      .returning();

    const timezone = await getUserTimezone(tx, updated.userId);
    const oldLocalDate = instantToLocalDate(existing.loggedAt, timezone);
    const newLocalDate = instantToLocalDate(updated.loggedAt, timezone);

    await recalculateDailySummary(tx, updated.userId, oldLocalDate);
    if (newLocalDate !== oldLocalDate) {
      await recalculateDailySummary(tx, updated.userId, newLocalDate);
    }

    return updated;
  });
}

/** Deletes a meal entry (cascades its items) and recalculates that day's summary. */
export async function deleteMealEntry(entryId: string) {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(mealEntries)
      .where(eq(mealEntries.entryId, entryId));
    if (!existing) {
      throw new Error(`Meal entry ${entryId} not found`);
    }

    const timezone = await getUserTimezone(tx, existing.userId);

    await tx.delete(mealEntries).where(eq(mealEntries.entryId, entryId));

    const localDate = instantToLocalDate(existing.loggedAt, timezone);
    await recalculateDailySummary(tx, existing.userId, localDate);
  });
}

"use server";

import { revalidatePath } from "next/cache";
import { getEffectiveUser } from "@/server/dev-bypass";
import { logEvent } from "@/server/lib/log";
import {
  deleteMealEntry,
  getEntryWithItems,
  updateMealEntryWithItems,
} from "@/server/repositories/meal-entries";
import { normalizeDetectedFood } from "@/server/vision/normalize";
import type { DetectedFood } from "@/server/vision/types";

// Server-side error messages can carry internal ids (see
// src/server/repositories/meal-entries.ts's "Meal entry {id} not found"
// etc.) — never forward err.message to the client (FRD §6 privacy pass).
// Log the real error server-side and return a generic one instead.
function toClientError(err: unknown, fallback: string, event: string): string {
  logEvent(event, {
    cause: err instanceof Error ? err.message : String(err),
  });
  return fallback;
}

async function assertOwnedEntry(entryId: string, userId: string) {
  const entryWithItems = await getEntryWithItems(entryId);
  if (!entryWithItems || entryWithItems.entry.userId !== userId) {
    throw new Error("You don't have access to that meal.");
  }
  return entryWithItems;
}

export interface SaveEntryItem {
  item: DetectedFood;
  isUserEdited: boolean;
}

export type SaveEntryResult =
  { success: true } | { success: false; error: string };

export async function updateEntryAction(
  entryId: string,
  items: SaveEntryItem[],
): Promise<SaveEntryResult> {
  const user = await getEffectiveUser();
  if (!user) {
    return { success: false, error: "You must be signed in." };
  }
  await assertOwnedEntry(entryId, user.id);

  if (items.length === 0) {
    return {
      success: false,
      error:
        "A meal needs at least one item — delete the whole meal instead if you want to remove it.",
    };
  }

  try {
    await updateMealEntryWithItems(
      entryId,
      items.map(({ item, isUserEdited }) =>
        normalizeDetectedFood(item, isUserEdited),
      ),
    );
    revalidatePath("/dashboard");
    revalidatePath(`/entries/${entryId}`);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: toClientError(
        err,
        "Failed to save changes.",
        "update_entry_failed",
      ),
    };
  }
}

export type DeleteEntryResult =
  { success: true } | { success: false; error: string };

/** Returns a result rather than calling redirect() itself, so the client
 * can navigate on success — avoids relying on Next's internal (undocumented
 * digest-based) redirect-error shape when this is awaited from a client
 * component. */
export async function deleteEntryAction(
  entryId: string,
): Promise<DeleteEntryResult> {
  const user = await getEffectiveUser();
  if (!user) {
    return { success: false, error: "You must be signed in." };
  }
  try {
    await assertOwnedEntry(entryId, user.id);
    await deleteMealEntry(entryId);
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: toClientError(
        err,
        "Failed to delete this meal.",
        "delete_entry_failed",
      ),
    };
  }
}

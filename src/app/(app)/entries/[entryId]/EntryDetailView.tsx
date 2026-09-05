"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { searchFoodsAction } from "@/app/(app)/analyze/actions";
import { computeAbsoluteMacros } from "@/lib/portion-scaling";
import type { DetectedFood, FoodSearchResult } from "@/server/vision/types";
import { deleteEntryAction, updateEntryAction } from "./actions";

export interface EditableItem {
  localId: string;
  item: DetectedFood;
  isUserEdited: boolean;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function makeLocalId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

export function EntryDetailView({
  entryId,
  initialItems,
}: {
  entryId: string;
  initialItems: EditableItem[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<EditableItem[]>(initialItems);
  const [dirty, setDirty] = useState(false);

  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FoodSearchResult[]>([]);
  const [isSearching, startSearchTransition] = useTransition();
  const [searchError, setSearchError] = useState<string | null>(null);

  const [customName, setCustomName] = useState("");
  const [customGrams, setCustomGrams] = useState("");
  const [customCalories, setCustomCalories] = useState("");
  const [customProtein, setCustomProtein] = useState("");
  const [customCarbs, setCustomCarbs] = useState("");
  const [customFat, setCustomFat] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const totals = useMemo(
    () =>
      items.reduce(
        (acc, { item }) => ({
          calories: round2(acc.calories + item.calories),
          protein: round2(acc.protein + item.protein),
          carbs: round2(acc.carbs + item.carbs),
          fat: round2(acc.fat + item.fat),
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 },
      ),
    [items],
  );

  function updateItem(
    localId: string,
    updater: (prev: EditableItem) => EditableItem,
  ) {
    setDirty(true);
    setSaved(false);
    setItems((prev) =>
      prev.map((entry) => (entry.localId === localId ? updater(entry) : entry)),
    );
  }

  function handleGramsChange(localId: string, rawValue: string) {
    const grams = Number(rawValue);
    if (!Number.isFinite(grams) || grams <= 0) return;
    updateItem(localId, (entry) => ({
      ...entry,
      isUserEdited: true,
      item: {
        ...entry.item,
        portionGrams: grams,
        ...computeAbsoluteMacros(entry.item.per100g, grams),
      },
    }));
  }

  function adjustGrams(localId: string, delta: number) {
    const entry = items.find((e) => e.localId === localId);
    if (!entry) return;
    handleGramsChange(
      localId,
      String(Math.max(1, entry.item.portionGrams + delta)),
    );
  }

  function handleReplaceWithSearchResult(
    localId: string,
    food: FoodSearchResult,
  ) {
    updateItem(localId, (entry) => ({
      ...entry,
      isUserEdited: true,
      item: {
        ...entry.item,
        foodName: food.foodName,
        per100g: food.per100g,
        confidence: 1,
        alternatives: [],
        ...computeAbsoluteMacros(food.per100g, entry.item.portionGrams),
      },
    }));
  }

  function handleDeleteItem(localId: string) {
    setDirty(true);
    setSaved(false);
    setItems((prev) => prev.filter((entry) => entry.localId !== localId));
    if (replacingId === localId) setReplacingId(null);
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSearchError(null);
    startSearchTransition(async () => {
      try {
        setSearchResults(await searchFoodsAction(query));
      } catch (err) {
        setSearchError(err instanceof Error ? err.message : "Search failed.");
      }
    });
  }

  function handleSearchResultClick(food: FoodSearchResult) {
    if (replacingId) {
      handleReplaceWithSearchResult(replacingId, food);
      setReplacingId(null);
    } else {
      setDirty(true);
      setSaved(false);
      setItems((prev) => [
        ...prev,
        {
          localId: makeLocalId(),
          isUserEdited: true,
          item: {
            foodName: food.foodName,
            portionGrams: 100,
            ...computeAbsoluteMacros(food.per100g, 100),
            confidence: 1,
            alternatives: [],
            per100g: food.per100g,
          },
        },
      ]);
    }
    setSearchResults([]);
    setQuery("");
  }

  function handleAddCustom(e: React.FormEvent) {
    e.preventDefault();
    setCustomError(null);

    const grams = Number(customGrams);
    const calories = Number(customCalories);
    const protein = Number(customProtein);
    const carbs = Number(customCarbs);
    const fat = Number(customFat);
    const macrosValid = [calories, protein, carbs, fat].every(
      (v) => Number.isFinite(v) && v >= 0,
    );

    if (!customName.trim() || !(grams > 0) || !macrosValid) {
      setCustomError(
        "Enter a name, a positive gram amount, and non-negative macros.",
      );
      return;
    }

    const factor = 100 / grams;
    setDirty(true);
    setSaved(false);
    setItems((prev) => [
      ...prev,
      {
        localId: makeLocalId(),
        isUserEdited: true,
        item: {
          foodName: customName.trim(),
          portionGrams: grams,
          calories: round2(calories),
          protein: round2(protein),
          carbs: round2(carbs),
          fat: round2(fat),
          confidence: 1,
          alternatives: [],
          per100g: {
            calories: round2(calories * factor),
            protein: round2(protein * factor),
            carbs: round2(carbs * factor),
            fat: round2(fat * factor),
          },
        },
      },
    ]);
    setCustomName("");
    setCustomGrams("");
    setCustomCalories("");
    setCustomProtein("");
    setCustomCarbs("");
    setCustomFat("");
  }

  async function handleSaveChanges() {
    setIsSaving(true);
    setSaveError(null);
    const result = await updateEntryAction(
      entryId,
      items.map(({ item, isUserEdited }) => ({ item, isUserEdited })),
    );
    setIsSaving(false);
    if (result.success) {
      setDirty(false);
      setSaved(true);
    } else {
      setSaveError(result.error);
    }
  }

  async function handleDeleteMeal() {
    setIsDeleting(true);
    setDeleteError(null);
    const result = await deleteEntryAction(entryId);
    if (result.success) {
      router.push("/dashboard");
    } else {
      setIsDeleting(false);
      setDeleteError(result.error);
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-4">
      <div className="flex flex-col gap-3">
        {items.map(({ localId, item, isUserEdited }) => (
          <div
            key={localId}
            className="flex flex-col gap-3 rounded-lg border border-white/10 p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium">{item.foodName}</span>
              {!isUserEdited && item.confidence < 1 && (
                <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-xs text-[var(--foreground)]/70">
                  {Math.round(item.confidence * 100)}% match
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => adjustGrams(localId, -10)}
                aria-label={`Decrease ${item.foodName} portion`}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded border border-white/20 text-lg hover:bg-white/10"
              >
                −
              </button>
              <input
                type="number"
                inputMode="decimal"
                value={item.portionGrams}
                onChange={(e) => handleGramsChange(localId, e.target.value)}
                className="h-11 w-20 rounded border border-white/20 bg-transparent text-center text-sm"
              />
              <span className="text-sm text-[var(--foreground)]/60">g</span>
              <button
                type="button"
                onClick={() => adjustGrams(localId, 10)}
                aria-label={`Increase ${item.foodName} portion`}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded border border-white/20 text-lg hover:bg-white/10"
              >
                +
              </button>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-[var(--foreground)]/80 sm:grid-cols-4">
              <div>{item.calories} kcal</div>
              <div>{item.protein}g protein</div>
              <div>{item.carbs}g carbs</div>
              <div>{item.fat}g fat</div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setReplacingId(localId)}
                className="flex-1 rounded border border-white/20 px-3 py-2 text-xs hover:bg-white/10"
              >
                Replace via search
              </button>
              <button
                type="button"
                onClick={() => handleDeleteItem(localId)}
                className="flex-1 rounded border border-white/20 px-3 py-2 text-xs text-[var(--foreground)]/70 hover:bg-white/10"
              >
                Delete item
              </button>
            </div>
          </div>
        ))}
      </div>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">
            {replacingId ? "Replace item via search" : "Search foods manually"}
          </h2>
          {replacingId && (
            <button
              type="button"
              onClick={() => {
                setReplacingId(null);
                setSearchResults([]);
              }}
              className="text-xs text-[var(--foreground)]/60 underline"
            >
              Cancel
            </button>
          )}
        </div>
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. grilled salmon"
            className="h-11 flex-1 rounded border border-white/20 bg-transparent px-3 text-sm"
          />
          <button
            type="submit"
            disabled={isSearching || !query.trim()}
            className="h-11 rounded border border-white/20 px-4 text-sm hover:bg-white/10 disabled:opacity-60"
          >
            {isSearching ? "Searching…" : "Search"}
          </button>
        </form>
        {searchError && (
          <p className="text-sm text-[var(--foreground)]/70">{searchError}</p>
        )}
        {searchResults.length > 0 && (
          <ul className="flex flex-col gap-1">
            {searchResults.map((food) => (
              <li
                key={food.foodName}
                className="flex items-center justify-between gap-2 rounded border border-white/10 px-3 py-2 text-sm"
              >
                <span>
                  {food.foodName} — {food.per100g.calories} kcal/100g
                </span>
                <button
                  type="button"
                  onClick={() => handleSearchResultClick(food)}
                  className="rounded bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20"
                >
                  {replacingId ? "Use this" : "Add"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Or enter a food manually</h2>
        <form
          onSubmit={handleAddCustom}
          className="grid grid-cols-2 gap-2 sm:grid-cols-3"
        >
          <input
            placeholder="Food name"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            className="col-span-2 h-11 rounded border border-white/20 bg-transparent px-3 text-sm sm:col-span-3"
          />
          <input
            placeholder="Grams"
            inputMode="decimal"
            value={customGrams}
            onChange={(e) => setCustomGrams(e.target.value)}
            className="h-11 rounded border border-white/20 bg-transparent px-3 text-sm"
          />
          <input
            placeholder="Calories"
            inputMode="decimal"
            value={customCalories}
            onChange={(e) => setCustomCalories(e.target.value)}
            className="h-11 rounded border border-white/20 bg-transparent px-3 text-sm"
          />
          <input
            placeholder="Protein (g)"
            inputMode="decimal"
            value={customProtein}
            onChange={(e) => setCustomProtein(e.target.value)}
            className="h-11 rounded border border-white/20 bg-transparent px-3 text-sm"
          />
          <input
            placeholder="Carbs (g)"
            inputMode="decimal"
            value={customCarbs}
            onChange={(e) => setCustomCarbs(e.target.value)}
            className="h-11 rounded border border-white/20 bg-transparent px-3 text-sm"
          />
          <input
            placeholder="Fat (g)"
            inputMode="decimal"
            value={customFat}
            onChange={(e) => setCustomFat(e.target.value)}
            className="h-11 rounded border border-white/20 bg-transparent px-3 text-sm"
          />
          <button
            type="submit"
            className="col-span-2 h-11 rounded bg-white/10 px-4 text-sm hover:bg-white/20 sm:col-span-3"
          >
            Add item
          </button>
        </form>
        {customError && (
          <p className="text-sm text-[var(--foreground)]/70">{customError}</p>
        )}
      </section>

      <div className="sticky bottom-0 flex flex-col gap-2 rounded-lg border border-white/10 bg-[var(--background)] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm">
            <div className="font-medium">{totals.calories} kcal</div>
            <div className="text-xs text-[var(--foreground)]/60">
              {totals.protein}g P · {totals.carbs}g C · {totals.fat}g F
            </div>
          </div>
          <button
            type="button"
            onClick={handleSaveChanges}
            disabled={isSaving || !dirty || items.length === 0}
            className="h-12 rounded bg-white/10 px-5 text-sm font-medium hover:bg-white/20 disabled:opacity-60"
          >
            {isSaving ? "Saving…" : saved ? "Saved" : "Save changes"}
          </button>
        </div>
        {saveError && (
          <p className="text-sm text-[var(--foreground)]/70">{saveError}</p>
        )}
        <button
          type="button"
          onClick={handleDeleteMeal}
          disabled={isDeleting}
          className="h-11 rounded border border-white/20 px-4 text-sm text-[var(--foreground)]/70 hover:bg-white/10 disabled:opacity-60"
        >
          {isDeleting ? "Deleting…" : "Delete this meal"}
        </button>
        {deleteError && (
          <p className="text-sm text-[var(--foreground)]/70">{deleteError}</p>
        )}
      </div>
    </div>
  );
}

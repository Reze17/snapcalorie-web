"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { computeAbsoluteMacros } from "@/lib/portion-scaling";
import type {
  DetectedFood,
  DetectedFoodAlternative,
  FoodSearchResult,
} from "@/server/vision/types";
import {
  runAnalysis,
  saveMealAction,
  searchFoodsAction,
  type AnalysisOutcome,
  type SaveMealItem,
} from "./actions";

interface EditableItem {
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

function itemsFromOutcome(outcome: AnalysisOutcome): EditableItem[] {
  if (outcome.status !== "ok") return [];
  return outcome.result.items.map((item) => ({
    localId: makeLocalId(),
    item,
    isUserEdited: false,
  }));
}

function ConfidenceBadge({
  confidence,
  isUserEdited,
}: {
  confidence: number;
  isUserEdited: boolean;
}) {
  if (isUserEdited) return null;
  const ambiguous = confidence < 0.7;
  return (
    <span
      className={`num shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        ambiguous ? "bg-info-soft text-info" : "bg-good-soft text-good"
      }`}
    >
      {ambiguous ? "Low confidence" : `${Math.round(confidence * 100)}% match`}
    </span>
  );
}

export function AnalysisView({
  objectKey,
  initialOutcome,
}: {
  objectKey: string;
  initialOutcome: AnalysisOutcome;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState(initialOutcome);
  const [items, setItems] = useState<EditableItem[]>(() =>
    itemsFromOutcome(initialOutcome),
  );
  const [isRetrying, startRetryTransition] = useTransition();

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

  function handleSwapToAlternative(
    localId: string,
    alt: DetectedFoodAlternative,
  ) {
    updateItem(localId, (entry) => ({
      ...entry,
      isUserEdited: true,
      item: {
        ...entry.item,
        foodName: alt.foodName,
        per100g: alt.per100g,
        confidence: 1,
        alternatives: [],
        ...computeAbsoluteMacros(alt.per100g, entry.item.portionGrams),
      },
    }));
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

  function handleDelete(localId: string) {
    setItems((prev) => prev.filter((entry) => entry.localId !== localId));
    if (replacingId === localId) setReplacingId(null);
  }

  function handleRetry() {
    startRetryTransition(async () => {
      const next = await runAnalysis(objectKey);
      setOutcome(next);
      if (next.status === "ok") {
        setItems(itemsFromOutcome(next));
      }
    });
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

  async function handleSave() {
    setIsSaving(true);
    setSaveError(null);
    const payload: SaveMealItem[] = items.map(({ item, isUserEdited }) => ({
      item,
      isUserEdited,
    }));
    const result = await saveMealAction(objectKey, payload);
    if (result.success) {
      router.push("/dashboard");
    } else {
      setSaveError(result.error);
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-4">
      {outcome.status === "failed" && (
        <div className="flex flex-col gap-2.5 rounded-2xl bg-err-soft p-4">
          <p className="text-sm font-semibold text-err">{outcome.message}</p>
          <p className="text-xs text-text-muted">
            Your photo is still saved — you can retry, or add items manually
            below.
          </p>
          <button
            type="button"
            onClick={handleRetry}
            disabled={isRetrying}
            className="w-fit rounded-full bg-accent px-4 py-2 text-sm font-bold text-accent-ink disabled:opacity-60"
          >
            {isRetrying ? "Retrying…" : "Retry analysis"}
          </button>
        </div>
      )}

      {items.length === 0 && outcome.status === "ok" && (
        <p className="text-sm text-text-muted">
          No items yet. Search for foods or add one manually below.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {items.map(({ localId, item, isUserEdited }) => {
          const ambiguous = !isUserEdited && item.confidence < 0.7;
          return (
            <div
              key={localId}
              data-testid="item-card"
              data-food-name={item.foodName}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold">{item.foodName}</span>
                <ConfidenceBadge
                  confidence={item.confidence}
                  isUserEdited={isUserEdited}
                />
              </div>

              {ambiguous && (
                <div className="flex gap-2 rounded-xl bg-info-soft px-3 py-2 text-xs text-info">
                  <span>
                    Not fully sure about this one — check the portion and swap
                    it below if it looks off.
                  </span>
                </div>
              )}

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => adjustGrams(localId, -10)}
                  aria-label={`Decrease ${item.foodName} portion`}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border text-lg font-bold"
                >
                  −
                </button>
                <input
                  type="number"
                  inputMode="decimal"
                  value={item.portionGrams}
                  onChange={(e) => handleGramsChange(localId, e.target.value)}
                  className="num h-10 w-20 rounded-xl border border-border bg-bg text-center text-sm"
                />
                <span className="text-sm text-text-muted">g</span>
                <button
                  type="button"
                  onClick={() => adjustGrams(localId, 10)}
                  aria-label={`Increase ${item.foodName} portion`}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border text-lg font-bold"
                >
                  +
                </button>
                <span className="num ml-auto text-lg font-semibold">
                  {item.calories} kcal
                </span>
              </div>

              <div className="num grid grid-cols-3 gap-x-3 rounded-xl bg-bg px-3 py-2 text-xs text-text-muted">
                <div>{item.protein}g protein</div>
                <div>{item.carbs}g carbs</div>
                <div>{item.fat}g fat</div>
              </div>

              {ambiguous && item.alternatives.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-text-muted">
                    Could also be:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {item.alternatives.map((alt) => (
                      <button
                        key={alt.foodName}
                        type="button"
                        onClick={() => handleSwapToAlternative(localId, alt)}
                        className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold"
                      >
                        {alt.foodName}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setReplacingId(localId)}
                  className="flex-1 rounded-xl border border-border px-3 py-2 text-xs font-semibold"
                >
                  Replace via search
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(localId)}
                  className="flex-1 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-text-muted"
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">
            {replacingId ? "Replace item via search" : "Search foods manually"}
          </h2>
          {replacingId && (
            <button
              type="button"
              onClick={() => {
                setReplacingId(null);
                setSearchResults([]);
              }}
              className="text-xs font-semibold text-text-muted underline"
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
            className="h-11 flex-1 rounded-xl border border-border bg-surface px-3 text-sm"
          />
          <button
            type="submit"
            disabled={isSearching || !query.trim()}
            className="h-11 rounded-xl bg-accent px-4 text-sm font-bold text-accent-ink disabled:opacity-60"
          >
            {isSearching ? "Searching…" : "Search"}
          </button>
        </form>
        {searchError && <p className="text-sm text-err">{searchError}</p>}
        {searchResults.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {searchResults.map((food) => (
              <li
                key={food.foodName}
                className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              >
                <span>
                  {food.foodName}{" "}
                  <span className="num text-text-muted">
                    — {food.per100g.calories} kcal/100g
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => handleSearchResultClick(food)}
                  className="rounded-full bg-accent-soft px-3 py-1.5 text-xs font-bold text-accent-strong"
                >
                  {replacingId ? "Use this" : "Add"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-bold">Or enter a food manually</h2>
        <form
          onSubmit={handleAddCustom}
          className="grid grid-cols-2 gap-2 sm:grid-cols-3"
        >
          <input
            placeholder="Food name"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            className="col-span-2 h-11 rounded-xl border border-border bg-surface px-3 text-sm sm:col-span-3"
          />
          <input
            placeholder="Grams"
            inputMode="decimal"
            value={customGrams}
            onChange={(e) => setCustomGrams(e.target.value)}
            className="h-11 rounded-xl border border-border bg-surface px-3 text-sm"
          />
          <input
            placeholder="Calories"
            inputMode="decimal"
            value={customCalories}
            onChange={(e) => setCustomCalories(e.target.value)}
            className="h-11 rounded-xl border border-border bg-surface px-3 text-sm"
          />
          <input
            placeholder="Protein (g)"
            inputMode="decimal"
            value={customProtein}
            onChange={(e) => setCustomProtein(e.target.value)}
            className="h-11 rounded-xl border border-border bg-surface px-3 text-sm"
          />
          <input
            placeholder="Carbs (g)"
            inputMode="decimal"
            value={customCarbs}
            onChange={(e) => setCustomCarbs(e.target.value)}
            className="h-11 rounded-xl border border-border bg-surface px-3 text-sm"
          />
          <input
            placeholder="Fat (g)"
            inputMode="decimal"
            value={customFat}
            onChange={(e) => setCustomFat(e.target.value)}
            className="h-11 rounded-xl border border-border bg-surface px-3 text-sm"
          />
          <button
            type="submit"
            className="col-span-2 h-11 rounded-xl border border-border text-sm font-bold sm:col-span-3"
          >
            Add item
          </button>
        </form>
        {customError && <p className="text-sm text-err">{customError}</p>}
      </section>

      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+8px)] rounded-2xl border border-border bg-surface px-4 py-3 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.25)]">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm">
            <div className="num text-lg font-bold">{totals.calories} kcal</div>
            <div className="num text-xs text-text-muted">
              {totals.protein}g P · {totals.carbs}g C · {totals.fat}g F
            </div>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || items.length === 0}
            className="h-12 rounded-xl bg-accent px-5 text-sm font-bold text-accent-ink disabled:opacity-60"
          >
            {isSaving ? "Saving…" : "Save meal"}
          </button>
        </div>
        {saveError && <p className="mt-2 text-sm text-err">{saveError}</p>}
      </div>
    </div>
  );
}

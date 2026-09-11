"use client";

import { useActionState, useState } from "react";
import { logWeightAction, type LogWeightState } from "./actions";

const initialState: LogWeightState = {};

export function WeightProgressCard({
  startWeightKg,
  currentWeightKg,
  targetWeightKg,
  goalType,
}: {
  startWeightKg: number;
  currentWeightKg: number;
  targetWeightKg: number | null;
  goalType: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    logWeightAction,
    initialState,
  );
  const [showForm, setShowForm] = useState(false);

  const changed = currentWeightKg - startWeightKg;
  const lost = -changed; // positive when weight went down
  const needsTarget = goalType === "lose" || goalType === "gain";

  let progressPct: number | null = null;
  if (
    needsTarget &&
    targetWeightKg != null &&
    startWeightKg !== targetWeightKg
  ) {
    const raw =
      ((startWeightKg - currentWeightKg) / (startWeightKg - targetWeightKg)) *
      100;
    progressPct = Math.max(0, Math.min(100, Math.round(raw)));
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">Weight progress</span>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="text-xs font-bold text-accent"
        >
          {showForm ? "Cancel" : "+ Log weight"}
        </button>
      </div>

      {showForm ? (
        <form
          action={formAction}
          className="flex items-center gap-2"
          onSubmit={() => setShowForm(false)}
        >
          <input
            type="number"
            name="weightKg"
            inputMode="decimal"
            step="0.1"
            defaultValue={currentWeightKg}
            className="num h-10 flex-1 rounded-xl border border-border bg-bg px-3 text-sm"
          />
          <button
            type="submit"
            disabled={pending}
            className="h-10 rounded-xl bg-accent px-4 text-sm font-bold text-accent-ink disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </form>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="num text-2xl font-bold">
              {startWeightKg.toFixed(1)} kg
            </span>
            <span className="text-text-faint">→</span>
            <span className="num text-2xl font-bold text-accent">
              {currentWeightKg.toFixed(1)} kg
            </span>
          </div>
          <p className="num text-sm text-text-muted">
            {Math.abs(lost).toFixed(1)} kg {lost >= 0 ? "lost" : "gained"}
          </p>
          {needsTarget && targetWeightKg != null && (
            <>
              <p className="num text-xs text-text-faint">
                Goal: {targetWeightKg.toFixed(1)} kg
              </p>
              {progressPct != null && (
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              )}
              {progressPct != null && (
                <p className="num text-xs text-text-muted">
                  {progressPct}% of the way there
                </p>
              )}
            </>
          )}
        </>
      )}
      {state.error && <p className="text-xs text-err">{state.error}</p>}
    </div>
  );
}

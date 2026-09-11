/**
 * Turns raw consumed/target numbers into the *kind* of coaching message
 * to show — never the copy itself (that stays in the component, same
 * split as daily-metrics.ts). Every threshold here is a deliberately
 * simple, documented heuristic, not a clinical rule.
 */

export interface ProspectiveMealCheck {
  /** consumedSoFar + mealCalories */
  afterTotal: number;
  /** target - afterTotal. Negative once over. */
  remainingAfter: number;
  isOverTarget: boolean;
  /** 0 when not over target. */
  overBy: number;
}

/**
 * What logging *this* meal, on top of what's already logged today, would
 * do to the day — used at the "Add to Log" step so feedback appears
 * before the meal is saved, not after (FR: the AI scanner should show
 * "after this meal: N kcal remaining" as part of confirming, not as a
 * separate step).
 */
export function evaluateProspectiveMeal(
  dailyTarget: number,
  consumedSoFar: number,
  mealCalories: number,
): ProspectiveMealCheck {
  const afterTotal = consumedSoFar + mealCalories;
  const remainingAfter = dailyTarget - afterTotal;
  return {
    afterTotal,
    remainingAfter,
    isOverTarget: remainingAfter < 0,
    overBy: remainingAfter < 0 ? Math.abs(remainingAfter) : 0,
  };
}

export type DayStatus =
  | { kind: "no_entries" }
  | { kind: "over"; overBy: number }
  | { kind: "near_target"; remaining: number }
  | { kind: "under"; consumed: number; target: number }
  | { kind: "on_track"; remaining: number };

/** Within this many kcal of target (and not yet over) counts as "almost
 * there" — small enough to be a useful dinner-planning number (FR
 * scenario: "200 kcal remaining, if planning dinner consider ~this
 * much"), not so small it rarely fires. */
const NEAR_TARGET_THRESHOLD_KCAL = 300;

/** Below this fraction of target counts as "significantly under" — only
 * meaningful once the user has actually logged something; a fresh day
 * with nothing logged yet is "no_entries", not "under". */
const UNDER_TARGET_RATIO = 0.6;

export function evaluateDayStatus(consumed: number, target: number): DayStatus {
  if (consumed <= 0) return { kind: "no_entries" };

  const remaining = target - consumed;
  if (remaining < 0) return { kind: "over", overBy: Math.abs(remaining) };
  if (remaining <= NEAR_TARGET_THRESHOLD_KCAL) {
    return { kind: "near_target", remaining };
  }
  if (consumed < target * UNDER_TARGET_RATIO) {
    return { kind: "under", consumed, target };
  }
  return { kind: "on_track", remaining };
}

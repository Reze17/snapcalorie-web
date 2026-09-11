/**
 * A suggested split of the daily target across meal periods — guidance,
 * never enforcement (FR-style rule from the personalized-goal spec:
 * "these are guidelines, not strict requirements"). Nothing in the app
 * checks a logged meal against these numbers or blocks/warns based on
 * them; they only ever appear as a reference on the goal screen.
 */
export interface MealBudget {
  breakfast: number;
  lunch: number;
  dinner: number;
  snacks: number;
}

const SHARES = {
  breakfast: 0.25,
  lunch: 0.3,
  dinner: 0.35,
  snacks: 0.1,
} as const;

/**
 * Rounds each share independently, then folds the rounding remainder
 * into snacks (the smallest, least-consequential bucket) so the four
 * numbers always sum to exactly dailyTarget — a chart or list that
 * doesn't add up to the number it's splitting reads as broken.
 */
export function distributeMealBudget(dailyTarget: number): MealBudget {
  const breakfast = Math.round(dailyTarget * SHARES.breakfast);
  const lunch = Math.round(dailyTarget * SHARES.lunch);
  const dinner = Math.round(dailyTarget * SHARES.dinner);
  const snacks = dailyTarget - breakfast - lunch - dinner;
  return { breakfast, lunch, dinner, snacks };
}

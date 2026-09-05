import Decimal from "decimal.js";

export interface MacroProfile {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/**
 * The FRD §4 / CLAUDE.md linear portion-scaling rule:
 *   value_new = value_0 * (m_new / m_0)
 * m_0 = 0 is undefined (division by zero) and always a caller bug — guard
 * against it explicitly rather than silently returning Infinity/NaN.
 */
export function scaleValue(value0: number, m0: number, mNew: number): number {
  if (m0 === 0) {
    throw new Error("Cannot scale from a zero baseline (m_0 = 0)");
  }
  return new Decimal(value0)
    .times(mNew)
    .dividedBy(m0)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toNumber();
}

/**
 * Computes absolute macros for a given portion by scaling from the food's
 * fixed per100g baseline (m_0 = 100) rather than from whatever the
 * previously-displayed value was — this is what "prefer recomputing from
 * per100g to avoid compounding rounding" means: repeated edits always
 * scale from the same fixed baseline instead of chaining roundings.
 */
export function computeAbsoluteMacros(
  per100g: MacroProfile,
  grams: number,
): MacroProfile {
  return {
    calories: scaleValue(per100g.calories, 100, grams),
    protein: scaleValue(per100g.protein, 100, grams),
    carbs: scaleValue(per100g.carbs, 100, grams),
    fat: scaleValue(per100g.fat, 100, grams),
  };
}

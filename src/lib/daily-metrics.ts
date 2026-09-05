import Decimal from "decimal.js";

export interface DailyMetrics {
  consumed: number;
  target: number;
  /** target - consumed. Negative when over target — never clamped to zero. */
  remaining: number;
  /** (consumed / target) * 100. Can exceed 100; 0 when target is 0. */
  achievementPercentage: number;
}

/**
 * FRD §4 daily totals formulas, exactly:
 *   remaining = target - consumed
 *   achievementPercentage = (consumed / target) * 100
 * Deliberately does not clamp or branch on over/under target — FR-08's
 * non-punitive UI is a presentation concern (src/app/(app)/dashboard), not
 * a math one. This function returns the same shape whether the day is
 * empty, under, at, or over target.
 */
export function computeDailyMetrics(
  consumed: number,
  target: number,
): DailyMetrics {
  const consumedDecimal = new Decimal(consumed);
  const targetDecimal = new Decimal(target);

  const remaining = targetDecimal
    .minus(consumedDecimal)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toNumber();

  const achievementPercentage = targetDecimal.isZero()
    ? 0
    : consumedDecimal
        .dividedBy(targetDecimal)
        .times(100)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        .toNumber();

  return {
    consumed: new Decimal(consumed).toDecimalPlaces(2).toNumber(),
    target: new Decimal(target).toDecimalPlaces(2).toNumber(),
    remaining,
    achievementPercentage,
  };
}

import Decimal from "decimal.js";

/**
 * Personalized goal engine (post-Phase-10). Pure, no DB/timezone/I-O —
 * same convention as daily-metrics.ts/streak.ts/insights.ts. Every number
 * here is an *estimate*; the UI must never present it as exact (see the
 * "estimated" framing throughout onboarding/goal screens).
 */

export type Sex = "male" | "female";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "very_active";
export type GoalType = "lose" | "maintain" | "gain";

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very_active: 1.725,
};

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: "Sedentary — little to no exercise",
  light: "Lightly active — light exercise 1–3 days/week",
  moderate: "Moderately active — moderate exercise 3–5 days/week",
  very_active: "Very active — hard exercise 6–7 days/week",
};

/**
 * Mifflin-St Jeor — the most widely validated resting-energy equation for
 * a consumer app (more accurate than Harris-Benedict across body types).
 * `age` is the number the user entered at onboarding, not derived from a
 * birthdate — it goes stale by a year eventually, same simplification as
 * every other "current weight" style field in this app; Profile lets it
 * be corrected like anything else.
 */
export function calculateBMR(input: {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
}): number {
  const base = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age;
  return Math.round(input.sex === "male" ? base + 5 : base - 161);
}

export function calculateTDEE(
  bmr: number,
  activityLevel: ActivityLevel,
): number {
  return Math.round(bmr * ACTIVITY_MULTIPLIERS[activityLevel]);
}

/** BMI = weight(kg) / height(m)^2, per FRD's formula exactly. */
export function calculateBMI(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  return new Decimal(weightKg)
    .dividedBy(heightM * heightM)
    .toDecimalPlaces(1, Decimal.ROUND_HALF_UP)
    .toNumber();
}

export type BmiCategory =
  "underweight" | "healthy" | "overweight" | "obese" | "not_adult";

/**
 * Adult (>=20) categories only. Under 20, standard adult BMI cutoffs
 * don't apply (real pediatric assessment needs age/sex-specific growth
 * percentile charts, which this app does not implement) — "not_adult"
 * tells the UI to show a deferral message instead of a category.
 */
export function categorizeBmi(bmi: number, age: number): BmiCategory {
  if (age < 20) return "not_adult";
  if (bmi < 18.5) return "underweight";
  if (bmi < 25) return "healthy";
  if (bmi < 30) return "overweight";
  return "obese";
}

/** The weight range (kg) that maps to a "healthy" BMI at this height. */
export function healthyWeightRangeKg(heightCm: number): {
  minKg: number;
  maxKg: number;
} {
  const heightM = heightCm / 100;
  const area = heightM * heightM;
  return {
    minKg: Math.round(18.5 * area * 10) / 10,
    maxKg: Math.round(24.9 * area * 10) / 10,
  };
}

/** Energy density used to convert a target rate of weight change into a
 * daily calorie adjustment. ~7700 kcal per kg is the commonly-cited
 * estimate for body-mass energy content — an approximation, not a law of
 * physics for any individual. */
export const KCAL_PER_KG = 7700;

export function calculateWeeklyRateKg(
  currentWeightKg: number,
  targetWeightKg: number,
  timeframeWeeks: number,
): number {
  return (targetWeightKg - currentWeightKg) / timeframeWeeks;
}

/**
 * The fastest rate this app will treat as "safe" to plan toward — the
 * smaller of a flat cap and a percentage of body weight, so the cap
 * scales sensibly across body sizes. These are conservative, commonly
 * cited general guidelines, not a substitute for medical advice; the app
 * never blocks a user from a faster goal, it only recommends against it.
 */
export function safeWeeklyRateKg(
  currentWeightKg: number,
  goalType: "lose" | "gain",
): number {
  return goalType === "lose"
    ? Math.min(1, currentWeightKg * 0.01)
    : Math.min(0.5, currentWeightKg * 0.005);
}

export function isRateSafe(
  weeklyRateKg: number,
  goalType: "lose" | "gain",
  currentWeightKg: number,
): boolean {
  return Math.abs(weeklyRateKg) <= safeWeeklyRateKg(currentWeightKg, goalType);
}

/** The shortest timeframe (weeks, rounded up) that keeps the same total
 * change within the safe weekly rate — what the "extend your timeline"
 * suggestion offers concretely. */
export function suggestedSafeTimeframeWeeks(
  currentWeightKg: number,
  targetWeightKg: number,
  goalType: "lose" | "gain",
): number {
  const totalChangeKg = Math.abs(targetWeightKg - currentWeightKg);
  const rate = safeWeeklyRateKg(currentWeightKg, goalType);
  return Math.max(1, Math.ceil(totalChangeKg / rate));
}

/** Never let a computed target drop below a conservative floor — this
 * app does not encourage extreme restriction regardless of how aggressive
 * the user's requested timeline is. */
export function minimumSafeCalories(sex: Sex): number {
  return sex === "male" ? 1500 : 1200;
}

export interface GoalPlanInput {
  sex: Sex;
  age: number;
  heightCm: number;
  currentWeightKg: number;
  activityLevel: ActivityLevel;
  goalType: GoalType;
  /** Required for "lose"/"gain", ignored for "maintain". */
  targetWeightKg?: number;
  /** Required for "lose"/"gain", ignored for "maintain". */
  timeframeWeeks?: number;
}

export interface GoalPlan {
  bmr: number;
  maintenanceCalories: number;
  dailyCalorieTarget: number;
  bmi: number;
  bmiCategory: BmiCategory;
  healthyWeightRange: { minKg: number; maxKg: number };
  /** Only set for "lose"/"gain". Negative for a loss goal. */
  weeklyRateKg?: number;
  /** Only set for "lose"/"gain" — whether the requested pace is within
   * this app's safe guidance. Always true for "maintain". */
  isRateSafe: boolean;
  /** Only set when isRateSafe is false — the shortest timeframe (weeks)
   * that would bring the same goal back within safe guidance. */
  suggestedTimeframeWeeks?: number;
  /** Whether minimumSafeCalories clamped the computed target upward. */
  wasClampedToSafeFloor: boolean;
}

/**
 * The one function every entry point (onboarding, goal editing) calls.
 * Computes maintenance first, then adjusts for the goal — never the
 * other way around — so "maintenance vs. target" is always shown as two
 * numbers derived from the same baseline, per the goal-summary screen.
 */
export function buildGoalPlan(input: GoalPlanInput): GoalPlan {
  const bmr = calculateBMR({
    sex: input.sex,
    age: input.age,
    heightCm: input.heightCm,
    weightKg: input.currentWeightKg,
  });
  const maintenanceCalories = calculateTDEE(bmr, input.activityLevel);
  const bmi = calculateBMI(input.currentWeightKg, input.heightCm);
  const bmiCategory = categorizeBmi(bmi, input.age);
  const healthyWeightRange = healthyWeightRangeKg(input.heightCm);

  if (input.goalType === "maintain") {
    return {
      bmr,
      maintenanceCalories,
      dailyCalorieTarget: maintenanceCalories,
      bmi,
      bmiCategory,
      healthyWeightRange,
      isRateSafe: true,
      wasClampedToSafeFloor: false,
    };
  }

  if (input.targetWeightKg == null || input.timeframeWeeks == null) {
    throw new Error(
      `targetWeightKg and timeframeWeeks are required for goalType "${input.goalType}"`,
    );
  }

  // The "maintain" branch already returned above, so only "lose"/"gain"
  // reach here — this ternary (rather than a bare `input.goalType`) is
  // what lets TS narrow it to that two-value union for isRateSafe/
  // safeWeeklyRateKg/suggestedSafeTimeframeWeeks below.
  const goalType = input.goalType === "lose" ? "lose" : "gain";

  const weeklyRateKg = calculateWeeklyRateKg(
    input.currentWeightKg,
    input.targetWeightKg,
    input.timeframeWeeks,
  );
  const rateSafe = isRateSafe(weeklyRateKg, goalType, input.currentWeightKg);
  const dailyAdjustment = Math.round((weeklyRateKg * KCAL_PER_KG) / 7);
  const floor = minimumSafeCalories(input.sex);
  const rawTarget = maintenanceCalories + dailyAdjustment;
  const dailyCalorieTarget = Math.max(rawTarget, floor);

  return {
    bmr,
    maintenanceCalories,
    dailyCalorieTarget,
    bmi,
    bmiCategory,
    healthyWeightRange,
    weeklyRateKg,
    isRateSafe: rateSafe,
    suggestedTimeframeWeeks: rateSafe
      ? undefined
      : suggestedSafeTimeframeWeeks(
          input.currentWeightKg,
          input.targetWeightKg,
          goalType,
        ),
    wasClampedToSafeFloor: dailyCalorieTarget !== rawTarget,
  };
}

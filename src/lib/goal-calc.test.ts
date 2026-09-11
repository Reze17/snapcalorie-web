import { describe, expect, it } from "vitest";
import {
  buildGoalPlan,
  calculateBMI,
  calculateBMR,
  calculateTDEE,
  calculateWeeklyRateKg,
  categorizeBmi,
  healthyWeightRangeKg,
  isRateSafe,
  minimumSafeCalories,
  safeWeeklyRateKg,
  suggestedSafeTimeframeWeeks,
} from "./goal-calc";

describe("calculateBMR (Mifflin-St Jeor)", () => {
  it("computes for a male", () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5 = 1780
    expect(
      calculateBMR({ sex: "male", age: 30, heightCm: 180, weightKg: 80 }),
    ).toBe(1780);
  });

  it("computes for a female", () => {
    // 10*60 + 6.25*165 - 5*28 - 161 = 600 + 1031.25 - 140 - 161 = 1330.25 -> 1330
    expect(
      calculateBMR({ sex: "female", age: 28, heightCm: 165, weightKg: 60 }),
    ).toBe(1330);
  });
});

describe("calculateTDEE", () => {
  it("applies the activity multiplier", () => {
    expect(calculateTDEE(1780, "sedentary")).toBe(2136);
    expect(calculateTDEE(1780, "very_active")).toBe(3071);
  });
});

describe("calculateBMI", () => {
  it("matches the FRD formula", () => {
    expect(calculateBMI(80, 180)).toBeCloseTo(24.7, 1);
  });
});

describe("categorizeBmi", () => {
  it("categorizes adults across all four bands", () => {
    expect(categorizeBmi(17, 30)).toBe("underweight");
    expect(categorizeBmi(22, 30)).toBe("healthy");
    expect(categorizeBmi(27, 30)).toBe("overweight");
    expect(categorizeBmi(32, 30)).toBe("obese");
  });

  it("returns not_adult under 20 regardless of the number", () => {
    expect(categorizeBmi(24.8, 19)).toBe("not_adult");
  });
});

describe("healthyWeightRangeKg", () => {
  it("brackets the adult-healthy BMI band for a given height", () => {
    const range = healthyWeightRangeKg(180);
    expect(range.minKg).toBeCloseTo(59.9, 1);
    expect(range.maxKg).toBeCloseTo(80.7, 1);
  });
});

describe("calculateWeeklyRateKg", () => {
  it("is negative for a loss goal", () => {
    expect(calculateWeeklyRateKg(80, 74, 12)).toBeCloseTo(-0.5, 5);
  });

  it("is positive for a gain goal", () => {
    expect(calculateWeeklyRateKg(60, 65, 20)).toBeCloseTo(0.25, 5);
  });
});

describe("safeWeeklyRateKg / isRateSafe", () => {
  it("caps loss at min(1kg, 1% bodyweight) per week", () => {
    expect(safeWeeklyRateKg(80, "lose")).toBe(0.8); // 1% of 80kg
    expect(safeWeeklyRateKg(150, "lose")).toBe(1); // flat cap wins
  });

  it("caps gain at min(0.5kg, 0.5% bodyweight) per week", () => {
    expect(safeWeeklyRateKg(60, "gain")).toBe(0.3);
    expect(safeWeeklyRateKg(200, "gain")).toBe(0.5);
  });

  it("flags an aggressive loss rate as unsafe", () => {
    expect(isRateSafe(-1.5, "lose", 80)).toBe(false);
    expect(isRateSafe(-0.5, "lose", 80)).toBe(true);
  });
});

describe("suggestedSafeTimeframeWeeks", () => {
  it("suggests a longer timeframe that respects the safe rate", () => {
    // 6kg to lose at 80kg -> safe rate 0.8kg/week -> ceil(6/0.8) = 8 weeks
    expect(suggestedSafeTimeframeWeeks(80, 74, "lose")).toBe(8);
  });
});

describe("minimumSafeCalories", () => {
  it("differs by sex", () => {
    expect(minimumSafeCalories("male")).toBe(1500);
    expect(minimumSafeCalories("female")).toBe(1200);
  });
});

describe("buildGoalPlan", () => {
  it("builds a maintain plan at estimated TDEE with no rate/timeframe", () => {
    const plan = buildGoalPlan({
      sex: "male",
      age: 30,
      heightCm: 180,
      currentWeightKg: 80,
      activityLevel: "sedentary",
      goalType: "maintain",
    });
    expect(plan.dailyCalorieTarget).toBe(plan.maintenanceCalories);
    expect(plan.weeklyRateKg).toBeUndefined();
    expect(plan.isRateSafe).toBe(true);
    expect(plan.wasClampedToSafeFloor).toBe(false);
  });

  it("builds a realistic loss plan below maintenance, flagged safe", () => {
    const plan = buildGoalPlan({
      sex: "male",
      age: 30,
      heightCm: 180,
      currentWeightKg: 80,
      activityLevel: "sedentary",
      goalType: "lose",
      targetWeightKg: 74,
      timeframeWeeks: 24, // 0.25kg/week, well within the safe cap
    });
    expect(plan.dailyCalorieTarget).toBeLessThan(plan.maintenanceCalories);
    expect(plan.isRateSafe).toBe(true);
    expect(plan.suggestedTimeframeWeeks).toBeUndefined();
  });

  it("flags an unrealistically fast loss goal and suggests a safer timeframe", () => {
    const plan = buildGoalPlan({
      sex: "male",
      age: 30,
      heightCm: 180,
      currentWeightKg: 80,
      activityLevel: "sedentary",
      goalType: "lose",
      targetWeightKg: 68, // 12kg
      timeframeWeeks: 4, // 3kg/week — well past any safe guidance
    });
    expect(plan.isRateSafe).toBe(false);
    expect(plan.suggestedTimeframeWeeks).toBeGreaterThan(4);
  });

  it("never lets the target drop below the sex-specific safety floor", () => {
    const plan = buildGoalPlan({
      sex: "female",
      age: 25,
      heightCm: 160,
      currentWeightKg: 55,
      activityLevel: "sedentary",
      goalType: "lose",
      targetWeightKg: 45,
      timeframeWeeks: 4, // extreme deficit if unclamped
    });
    expect(plan.dailyCalorieTarget).toBe(1200);
    expect(plan.wasClampedToSafeFloor).toBe(true);
  });

  it("builds a gain plan above maintenance", () => {
    const plan = buildGoalPlan({
      sex: "female",
      age: 27,
      heightCm: 165,
      currentWeightKg: 60,
      activityLevel: "moderate",
      goalType: "gain",
      targetWeightKg: 65,
      timeframeWeeks: 40, // 0.125kg/week, safe
    });
    expect(plan.dailyCalorieTarget).toBeGreaterThan(plan.maintenanceCalories);
    expect(plan.isRateSafe).toBe(true);
  });

  it("throws for lose/gain without a target weight and timeframe", () => {
    expect(() =>
      buildGoalPlan({
        sex: "male",
        age: 30,
        heightCm: 180,
        currentWeightKg: 80,
        activityLevel: "sedentary",
        goalType: "lose",
      }),
    ).toThrow();
  });
});

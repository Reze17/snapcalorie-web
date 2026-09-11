"use server";

import { DateTime } from "luxon";
import { buildGoalPlan, type GoalPlan } from "@/lib/goal-calc";
import { getEffectiveUser } from "@/server/dev-bypass";
import { instantToLocalDate } from "@/server/lib/timezone";
import {
  completeOnboarding,
  getUserById,
  saveGoalProfile,
} from "@/server/repositories/users";
import { upsertWeightLog } from "@/server/repositories/weight-logs";
import {
  goalProfileSchema,
  type GoalProfileInput,
} from "@/server/validation/goal";

export interface SubmitGoalResult {
  success: boolean;
  error?: string;
  plan?: GoalPlan;
}

/**
 * The server never trusts a client-computed calorie target — buildGoalPlan
 * runs again here from the raw inputs, same "derive it ourselves" pattern
 * as the vision pipeline's macro math. The client also runs buildGoalPlan
 * (it's a pure function, safe to import client-side) purely so the wizard
 * can show an instant preview/warning before this action is ever called.
 */
async function computePlan(
  input: GoalProfileInput,
): Promise<{ plan: GoalPlan; error?: string }> {
  try {
    const plan = buildGoalPlan({
      sex: input.sex,
      age: input.age,
      heightCm: input.heightCm,
      currentWeightKg: input.currentWeightKg,
      activityLevel: input.activityLevel,
      goalType: input.goalType,
      targetWeightKg: input.targetWeightKg,
      timeframeWeeks: input.timeframeWeeks,
    });
    return { plan };
  } catch (err) {
    return {
      plan: undefined as never,
      error: err instanceof Error ? err.message : "Could not compute a plan.",
    };
  }
}

export async function submitOnboardingAction(
  raw: Record<string, unknown>,
): Promise<SubmitGoalResult> {
  const user = await getEffectiveUser();
  if (!user) {
    return { success: false, error: "You must be signed in." };
  }

  const parsed = goalProfileSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const { plan, error } = await computePlan(parsed.data);
  if (error) return { success: false, error };

  const dbUser = await getUserById(user.id);
  if (!dbUser) return { success: false, error: "You must be signed in." };
  const localDate = instantToLocalDate(new Date(), dbUser.timezone);

  const timeframeWeeks =
    parsed.data.goalType === "maintain"
      ? undefined
      : parsed.data.timeframeWeeks;
  const targetDate =
    parsed.data.goalType === "maintain" || !timeframeWeeks
      ? null
      : DateTime.fromISO(localDate).plus({ weeks: timeframeWeeks }).toISODate();

  await completeOnboarding(user.id, {
    age: parsed.data.age,
    sex: parsed.data.sex,
    heightCm: parsed.data.heightCm,
    activityLevel: parsed.data.activityLevel,
    goalType: parsed.data.goalType,
    targetWeightKg: parsed.data.targetWeightKg ?? null,
    targetDate,
    dailyCalorieTarget: plan.dailyCalorieTarget,
    currentWeightKg: parsed.data.currentWeightKg,
    localDate,
  });

  return { success: true, plan };
}

/**
 * Same computation, but for editing an existing goal from Profile — does
 * not touch onboardingCompletedAt (already set) and logs a fresh weight
 * entry for today since editing a goal always starts from "what do you
 * weigh right now."
 */
export async function updateGoalAction(
  raw: Record<string, unknown>,
): Promise<SubmitGoalResult> {
  const user = await getEffectiveUser();
  if (!user) {
    return { success: false, error: "You must be signed in." };
  }

  const parsed = goalProfileSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const { plan, error } = await computePlan(parsed.data);
  if (error) return { success: false, error };

  const dbUser = await getUserById(user.id);
  if (!dbUser) return { success: false, error: "You must be signed in." };
  const localDate = instantToLocalDate(new Date(), dbUser.timezone);

  const timeframeWeeks =
    parsed.data.goalType === "maintain"
      ? undefined
      : parsed.data.timeframeWeeks;
  const targetDate =
    parsed.data.goalType === "maintain" || !timeframeWeeks
      ? null
      : DateTime.fromISO(localDate).plus({ weeks: timeframeWeeks }).toISODate();

  await saveGoalProfile(user.id, {
    age: parsed.data.age,
    sex: parsed.data.sex,
    heightCm: parsed.data.heightCm,
    activityLevel: parsed.data.activityLevel,
    goalType: parsed.data.goalType,
    targetWeightKg: parsed.data.targetWeightKg ?? null,
    targetDate,
    dailyCalorieTarget: plan.dailyCalorieTarget,
  });
  await upsertWeightLog(user.id, localDate, parsed.data.currentWeightKg);

  return { success: true, plan };
}

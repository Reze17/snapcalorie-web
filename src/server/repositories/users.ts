import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import type { ActivityLevel, GoalType, Sex } from "@/lib/goal-calc";
import { upsertWeightLog } from "./weight-logs";

export async function getUserByEmail(email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return user;
}

export async function getUserById(id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user;
}

/** Creates a credentials user. daily_calorie_target/timezone are left to their column defaults (2000 / UTC). */
export async function createUserWithPassword(
  email: string,
  passwordHash: string,
) {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash })
    .returning();
  return user;
}

export interface ProfileUpdate {
  dailyCalorieTarget: number;
  timezone: string;
}

/**
 * Updates the user's profile only. Deliberately does not touch
 * daily_summaries — historical target snapshots stay immutable, and the
 * new target takes effect the next time recalculateDailySummary runs.
 */
export async function updateUserProfile(userId: string, update: ProfileUpdate) {
  const [user] = await db
    .update(users)
    .set({
      dailyCalorieTarget: update.dailyCalorieTarget,
      timezone: update.timezone,
    })
    .where(eq(users.id, userId))
    .returning();
  return user;
}

export interface GoalProfileUpdate {
  age: number;
  sex: Sex;
  heightCm: number;
  activityLevel: ActivityLevel;
  goalType: GoalType;
  /** null for "maintain". */
  targetWeightKg: number | null;
  /** null for "maintain". */
  targetDate: string | null;
  /** Already computed by buildGoalPlan (src/lib/goal-calc.ts) — this
   * repo never does the math itself, same separation as every other
   * pure-lib-then-persist flow in this app. */
  dailyCalorieTarget: number;
}

/**
 * Shared by onboarding and later goal edits (Profile → "Your goal").
 * Deliberately does not touch daily_summaries, same immutable-snapshot
 * rule as updateUserProfile above.
 */
export async function saveGoalProfile(
  userId: string,
  update: GoalProfileUpdate,
) {
  const [user] = await db
    .update(users)
    .set({
      age: update.age,
      sex: update.sex,
      heightCm: update.heightCm.toFixed(1),
      activityLevel: update.activityLevel,
      goalType: update.goalType,
      targetWeightKg: update.targetWeightKg?.toFixed(1) ?? null,
      targetDate: update.targetDate,
      dailyCalorieTarget: update.dailyCalorieTarget,
    })
    .where(eq(users.id, userId))
    .returning();
  return user;
}

/**
 * Onboarding's one write: the goal profile plus the user's starting
 * weight, together — a user is never left with a goal but no weight
 * history (the weight-progress card needs a "day 1" point to measure
 * from), or a weight log with no goal to measure it against.
 */
export async function completeOnboarding(
  userId: string,
  update: GoalProfileUpdate & { currentWeightKg: number; localDate: string },
) {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .update(users)
      .set({
        age: update.age,
        sex: update.sex,
        heightCm: update.heightCm.toFixed(1),
        activityLevel: update.activityLevel,
        goalType: update.goalType,
        targetWeightKg: update.targetWeightKg?.toFixed(1) ?? null,
        targetDate: update.targetDate,
        dailyCalorieTarget: update.dailyCalorieTarget,
        onboardingCompletedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    await upsertWeightLog(userId, update.localDate, update.currentWeightKg, tx);

    return user;
  });
}

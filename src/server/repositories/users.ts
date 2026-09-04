import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";

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

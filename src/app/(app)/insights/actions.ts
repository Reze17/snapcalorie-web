"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getEffectiveUser } from "@/server/dev-bypass";
import { instantToLocalDate } from "@/server/lib/timezone";
import { getUserById } from "@/server/repositories/users";
import { upsertWeightLog } from "@/server/repositories/weight-logs";

export interface LogWeightState {
  error?: string;
  success?: boolean;
}

const weightSchema = z.coerce
  .number({ message: "Enter your weight" })
  .min(30, "Enter a valid weight")
  .max(300, "Enter a valid weight");

/**
 * Logs today's weight only — same "one entry per local day, upsert"
 * pattern as everything else date-keyed in this app. Never touches the
 * goal profile or daily_calorie_target; that only changes via
 * updateGoalAction (src/app/onboarding/actions.ts), with the user's own
 * confirmation.
 */
export async function logWeightAction(
  _prevState: LogWeightState,
  formData: FormData,
): Promise<LogWeightState> {
  const user = await getEffectiveUser();
  if (!user) return { error: "You must be signed in" };

  const parsed = weightSchema.safeParse(formData.get("weightKg"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const dbUser = await getUserById(user.id);
  if (!dbUser) return { error: "You must be signed in" };

  const localDate = instantToLocalDate(new Date(), dbUser.timezone);
  await upsertWeightLog(user.id, localDate, parsed.data);
  revalidatePath("/insights");
  return { success: true };
}

import { z } from "zod";

// Shared by onboarding's final submit and later goal edits from Profile.
// targetWeightKg/timeframeWeeks are optional at the schema level because
// they don't apply to "maintain" — the refine below is what actually
// requires them for "lose"/"gain".
export const goalProfileSchema = z
  .object({
    age: z.coerce
      .number({ message: "Enter your age" })
      .int("Age must be a whole number")
      .min(13, "Must be at least 13")
      .max(100, "Enter a valid age"),
    sex: z.enum(["male", "female"], { message: "Choose one" }),
    heightCm: z.coerce
      .number({ message: "Enter your height" })
      .min(100, "Enter a valid height")
      .max(250, "Enter a valid height"),
    currentWeightKg: z.coerce
      .number({ message: "Enter your current weight" })
      .min(30, "Enter a valid weight")
      .max(300, "Enter a valid weight"),
    goalType: z.enum(["lose", "maintain", "gain"], { message: "Choose one" }),
    targetWeightKg: z.coerce
      .number()
      .min(30, "Enter a valid weight")
      .max(300, "Enter a valid weight")
      .optional(),
    // Weeks, not months — the UI converts "3/6/12 months" (and any
    // custom entry) to weeks before this schema ever sees it, so there's
    // one unit of time to reason about from here down.
    timeframeWeeks: z.coerce
      .number()
      .int("Enter a whole number of weeks")
      .min(1, "Must be at least 1 week")
      .max(260, "Enter a shorter timeframe")
      .optional(),
    activityLevel: z.enum(["sedentary", "light", "moderate", "very_active"], {
      message: "Choose one",
    }),
  })
  .refine(
    (data) =>
      data.goalType === "maintain" ||
      (data.targetWeightKg != null && data.timeframeWeeks != null),
    {
      message: "Target weight and timeframe are required for this goal.",
      path: ["targetWeightKg"],
    },
  );

export type GoalProfileInput = z.infer<typeof goalProfileSchema>;

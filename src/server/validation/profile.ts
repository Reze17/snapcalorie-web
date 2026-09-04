import { z } from "zod";

const IANA_TIMEZONES = new Set(Intl.supportedValuesOf("timeZone"));

export const profileSchema = z.object({
  dailyCalorieTarget: z.coerce
    .number({ message: "Calorie target must be a number" })
    .int("Calorie target must be a whole number, no decimals")
    .min(800, "Calorie target must be at least 800")
    .max(8000, "Calorie target must be at most 8000"),
  timezone: z
    .string()
    .refine((tz) => IANA_TIMEZONES.has(tz), { message: "Unknown timezone" }),
});

export type ProfileInput = z.infer<typeof profileSchema>;

export const IANA_TIMEZONE_LIST = Array.from(IANA_TIMEZONES).sort();

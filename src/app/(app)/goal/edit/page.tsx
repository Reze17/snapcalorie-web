import { DateTime } from "luxon";
import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/app/onboarding/OnboardingWizard";
import { getEffectiveUser } from "@/server/dev-bypass";
import { instantToLocalDate } from "@/server/lib/timezone";
import { getUserById } from "@/server/repositories/users";
import {
  getFirstWeight,
  getLatestWeight,
} from "@/server/repositories/weight-logs";

export default async function EditGoalPage() {
  const effectiveUser = await getEffectiveUser();
  if (!effectiveUser) redirect("/login");

  const user = await getUserById(effectiveUser.id);
  if (!user) redirect("/login");
  if (!user.onboardingCompletedAt) redirect("/onboarding");

  const [latestWeight, firstWeight] = await Promise.all([
    getLatestWeight(user.id),
    getFirstWeight(user.id),
  ]);
  const currentWeightKg = latestWeight?.weightKg ?? firstWeight?.weightKg;
  const todayLocal = instantToLocalDate(new Date(), user.timezone);
  const timeframeWeeks = user.targetDate
    ? Math.max(
        1,
        Math.round(
          DateTime.fromISO(user.targetDate).diff(
            DateTime.fromISO(todayLocal),
            "weeks",
          ).weeks,
        ),
      )
    : null;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-screen-sm flex-col bg-bg px-5 py-6">
      <OnboardingWizard
        mode="edit"
        initial={{
          age: user.age ? String(user.age) : "",
          sex: (user.sex as "male" | "female" | null) ?? null,
          heightCm: user.heightCm ? String(Number(user.heightCm)) : "",
          currentWeightKg: currentWeightKg
            ? String(Number(currentWeightKg))
            : "",
          goalType:
            (user.goalType as "lose" | "maintain" | "gain" | null) ?? null,
          targetWeightKg: user.targetWeightKg
            ? String(Number(user.targetWeightKg))
            : "",
          timeframeWeeks,
          customWeeks: timeframeWeeks ? String(timeframeWeeks) : "",
          activityLevel:
            (user.activityLevel as
              "sedentary" | "light" | "moderate" | "very_active" | null) ??
            null,
        }}
      />
    </div>
  );
}

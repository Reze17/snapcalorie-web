import { DateTime } from "luxon";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  buildGoalPlan,
  type ActivityLevel,
  type GoalType,
  type Sex,
} from "@/lib/goal-calc";
import { distributeMealBudget } from "@/lib/meal-budget";
import { getEffectiveUser } from "@/server/dev-bypass";
import { instantToLocalDate } from "@/server/lib/timezone";
import { getUserById } from "@/server/repositories/users";
import {
  getFirstWeight,
  getLatestWeight,
  getWeightHistory,
} from "@/server/repositories/weight-logs";

/** Weeks between today and a future ISO date, floored at 1 so a plan
 * doesn't divide by zero once the target date has effectively arrived. */
function weeksUntil(todayLocal: string, targetDate: string): number {
  const weeks = DateTime.fromISO(targetDate).diff(
    DateTime.fromISO(todayLocal),
    "weeks",
  ).weeks;
  return Math.max(1, Math.round(weeks));
}

export default async function GoalPage() {
  const effectiveUser = await getEffectiveUser();
  if (!effectiveUser) redirect("/login");

  const user = await getUserById(effectiveUser.id);
  if (!user) redirect("/login");

  if (!user.onboardingCompletedAt) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
        <p className="text-sm font-semibold">
          You haven&apos;t set up a personalized goal yet.
        </p>
        <p className="max-w-[28ch] text-xs text-text-muted">
          Answer a few quick questions and we&apos;ll calculate a daily calorie
          target for you.
        </p>
        <Link
          href="/onboarding"
          className="mt-1 rounded-full bg-accent px-5 py-2 text-sm font-bold text-accent-ink"
        >
          Set up my goal
        </Link>
      </div>
    );
  }

  const todayLocal = instantToLocalDate(new Date(), user.timezone);
  const [latestWeight, firstWeight, recentWeights] = await Promise.all([
    getLatestWeight(user.id),
    getFirstWeight(user.id),
    getWeightHistory(
      user.id,
      DateTime.fromISO(todayLocal).minus({ days: 21 }).toISODate()!,
      todayLocal,
    ),
  ]);

  const currentWeightKg = Number(
    latestWeight?.weightKg ?? firstWeight?.weightKg,
  );
  const goalType = user.goalType as GoalType;
  const needsTarget = goalType === "lose" || goalType === "gain";
  const targetWeightKg = user.targetWeightKg
    ? Number(user.targetWeightKg)
    : undefined;

  // Pace "needed from here" — recomputed live from today's weight and the
  // remaining time to the target date, purely descriptive. This never
  // changes the stored daily_calorie_target; only "Edit your goal" does
  // that, and only with the user's own confirmation (see CLAUDE.md-style
  // rule in src/lib/goal-calc.ts: never auto-adjust a target).
  const timeframeWeeks =
    needsTarget && user.targetDate
      ? weeksUntil(todayLocal, user.targetDate)
      : undefined;

  const plan = buildGoalPlan({
    sex: user.sex as Sex,
    age: user.age!,
    heightCm: Number(user.heightCm),
    currentWeightKg,
    activityLevel: user.activityLevel as ActivityLevel,
    goalType,
    targetWeightKg,
    timeframeWeeks,
  });

  const budget = distributeMealBudget(user.dailyCalorieTarget);

  // A simple plateau nudge (never an automatic change): if weight has
  // barely moved over ~3 weeks on a lose/gain goal, suggest reviewing
  // rather than silently doing anything about it.
  const isPlateaued =
    needsTarget &&
    recentWeights.length >= 2 &&
    Math.abs(
      Number(recentWeights[recentWeights.length - 1].weightKg) -
        Number(recentWeights[0].weightKg),
    ) < 0.3;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-bold">Your goal</h1>

      {needsTarget && targetWeightKg != null && (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs font-bold tracking-wide text-text-faint uppercase">
            Your goal
          </p>
          <p className="mt-1 text-lg font-bold">
            {goalType === "lose" ? "Lose" : "Gain"}{" "}
            {Math.abs(targetWeightKg - currentWeightKg).toFixed(1)} kg
          </p>
          <p className="num text-sm text-text-muted">
            {currentWeightKg.toFixed(1)} kg → {targetWeightKg.toFixed(1)} kg
          </p>
          {user.targetDate && (
            <p className="mt-1 text-xs text-text-faint">
              Target date {DateTime.fromISO(user.targetDate).toFormat("MMMM d")}
            </p>
          )}
        </div>
      )}

      {isPlateaued && (
        <div className="flex flex-col gap-2 rounded-2xl bg-info-soft p-4 text-info">
          <p className="text-sm font-semibold">
            Your weight has been fairly stable over the last 3 weeks.
          </p>
          <Link
            href="/goal/edit"
            className="w-fit rounded-full bg-info px-4 py-2 text-xs font-bold text-accent-ink"
          >
            Review goal
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold text-text-muted">
            Daily calorie target
          </span>
          <span className="num text-3xl font-bold text-accent">
            {user.dailyCalorieTarget.toLocaleString()}
          </span>
        </div>
        {plan.wasClampedToSafeFloor && (
          <p className="text-xs text-info">
            Kept at a safe minimum for your pace toward this goal.
          </p>
        )}
        <div className="flex items-center justify-between border-t border-border pt-3 text-sm text-text-muted">
          <span>Estimated maintenance</span>
          <span className="num">
            {plan.maintenanceCalories.toLocaleString()} kcal
          </span>
        </div>
        {needsTarget && plan.weeklyRateKg != null && (
          <p className="text-sm text-text-muted">
            At your current weight, that&apos;s about{" "}
            <span className="num font-semibold text-text">
              {Math.abs(plan.weeklyRateKg).toFixed(2)} kg
            </span>{" "}
            per week to reach your target by{" "}
            {user.targetDate
              ? DateTime.fromISO(user.targetDate).toFormat("MMM d")
              : "your target date"}
            .
          </p>
        )}
      </div>

      <div className="flex items-center justify-between rounded-2xl bg-surface-2 p-4">
        <div>
          <p className="text-xs font-bold tracking-wide text-text-faint uppercase">
            Your BMI
          </p>
          <p className="num text-xl font-bold">{plan.bmi}</p>
          {plan.bmiCategory === "not_adult" ? (
            <p className="text-[11px] text-text-faint">
              Adult BMI categories don&apos;t apply under 20 — check with a
              doctor for age-appropriate guidance.
            </p>
          ) : (
            <p className="text-[11px] text-text-faint capitalize">
              {plan.bmiCategory.replace("_", " ")} · healthy range{" "}
              {plan.healthyWeightRange.minKg}–{plan.healthyWeightRange.maxKg} kg
            </p>
          )}
        </div>
        <p className="max-w-[14ch] text-right text-[10.5px] text-text-faint">
          A screening measure — it doesn&apos;t tell the whole story about your
          health.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4">
        <p className="mb-3 text-sm font-bold">Meal budget</p>
        <p className="mb-3 text-xs text-text-muted">
          A guideline split of your target — eat differently across meals
          whenever you want, this isn&apos;t a rule.
        </p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <BudgetRow label="Breakfast" kcal={budget.breakfast} />
          <BudgetRow label="Lunch" kcal={budget.lunch} />
          <BudgetRow label="Dinner" kcal={budget.dinner} />
          <BudgetRow label="Snacks" kcal={budget.snacks} />
        </div>
      </div>

      <Link
        href="/goal/edit"
        className="w-full rounded-2xl border border-border py-3.5 text-center text-sm font-bold"
      >
        Edit your goal
      </Link>
    </div>
  );
}

function BudgetRow({ label, kcal }: { label: string; kcal: number }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-bg px-3 py-2">
      <span className="text-text-muted">{label}</span>
      <span className="num font-semibold">{kcal.toLocaleString()}</span>
    </div>
  );
}

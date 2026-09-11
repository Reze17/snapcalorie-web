"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  buildGoalPlan,
  type ActivityLevel,
  type GoalPlan,
  type GoalType,
  type Sex,
} from "@/lib/goal-calc";
import { submitOnboardingAction, updateGoalAction } from "./actions";

export interface FormState {
  age: string;
  sex: Sex | null;
  heightCm: string;
  currentWeightKg: string;
  goalType: GoalType | null;
  targetWeightKg: string;
  timeframeWeeks: number | null;
  customWeeks: string;
  activityLevel: ActivityLevel | null;
}

const EMPTY: FormState = {
  age: "",
  sex: null,
  heightCm: "",
  currentWeightKg: "",
  goalType: null,
  targetWeightKg: "",
  timeframeWeeks: null,
  customWeeks: "",
  activityLevel: null,
};

const TIMEFRAME_OPTIONS = [
  { label: "3 months", weeks: 13 },
  { label: "6 months", weeks: 26 },
  { label: "12 months", weeks: 52 },
];

const GOAL_OPTIONS: { value: GoalType; label: string; hint: string }[] = [
  { value: "lose", label: "Lose weight", hint: "Eat below maintenance" },
  { value: "maintain", label: "Maintain weight", hint: "Stay around here" },
  { value: "gain", label: "Gain weight", hint: "Eat above maintenance" },
];

const ACTIVITY_OPTIONS: { value: ActivityLevel; title: string; sub: string }[] =
  [
    { value: "sedentary", title: "Sedentary", sub: "Little to no exercise" },
    { value: "light", title: "Lightly active", sub: "1–3 days/week" },
    { value: "moderate", title: "Moderately active", sub: "3–5 days/week" },
    { value: "very_active", title: "Very active", sub: "6–7 days/week" },
  ];

function StepShell({
  step,
  total,
  title,
  subtitle,
  children,
  onBack,
  canBack,
}: {
  step: number;
  total: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onBack: () => void;
  canBack: boolean;
}) {
  return (
    <div className="flex min-h-[70vh] flex-col gap-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={!canBack}
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-text-muted disabled:opacity-0"
        >
          ‹
        </button>
        <div className="flex flex-1 gap-1.5">
          {Array.from({ length: total }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i <= step ? "bg-accent" : "bg-surface-3"
              }`}
            />
          ))}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold text-balance">{title}</h1>
          {subtitle && (
            <p className="mt-1.5 text-sm text-text-muted">{subtitle}</p>
          )}
        </div>
        <div className="flex flex-1 flex-col justify-center gap-3">
          {children}
        </div>
      </div>
    </div>
  );
}

function BigInput({
  value,
  onChange,
  suffix,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  suffix: string;
  placeholder: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2 border-b-2 border-border pb-2 focus-within:border-accent">
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="num w-full bg-transparent text-4xl font-semibold outline-none"
      />
      <span className="text-lg font-semibold text-text-faint">{suffix}</span>
    </div>
  );
}

function OptionCard({
  selected,
  onClick,
  title,
  sub,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  sub?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full flex-col gap-0.5 rounded-2xl border-2 px-4 py-3.5 text-left transition-colors ${
        selected ? "border-accent bg-accent-soft" : "border-border bg-surface"
      }`}
    >
      <span className="font-bold">{title}</span>
      {sub && <span className="text-xs text-text-muted">{sub}</span>}
    </button>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-2xl bg-accent py-4 text-base font-bold text-accent-ink disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function OnboardingWizard({
  mode = "onboarding",
  initial,
}: {
  /** "edit" reuses the same wizard from the Goal page to change an
   * existing plan — same steps and math, different action + redirect. */
  mode?: "onboarding" | "edit";
  initial?: Partial<FormState>;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>({ ...EMPTY, ...initial });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [useSuggestedTimeframe, setUseSuggestedTimeframe] = useState(false);

  const needsTarget = form.goalType === "lose" || form.goalType === "gain";

  // The step *sequence* skips target-weight/timeframe entirely for
  // "maintain" rather than showing-then-disabling them — fewer taps for
  // the one goal type that doesn't need that information at all.
  const steps = useMemo(
    () => [
      "age",
      "sex",
      "height",
      "weight",
      "goal",
      ...(needsTarget ? (["target", "timeframe"] as const) : []),
      "activity",
      "summary",
    ],
    [needsTarget],
  );

  const effectiveTimeframeWeeks = useMemo(() => {
    if (form.timeframeWeeks === -1) {
      const n = Number(form.customWeeks);
      return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
    }
    return form.timeframeWeeks;
  }, [form.timeframeWeeks, form.customWeeks]);

  const plan: GoalPlan | null = useMemo(() => {
    if (steps[step] !== "summary") return null;
    const age = Number(form.age);
    const heightCm = Number(form.heightCm);
    const currentWeightKg = Number(form.currentWeightKg);
    if (
      !age ||
      !heightCm ||
      !currentWeightKg ||
      !form.sex ||
      !form.goalType ||
      !form.activityLevel
    ) {
      return null;
    }
    try {
      return buildGoalPlan({
        sex: form.sex,
        age,
        heightCm,
        currentWeightKg,
        activityLevel: form.activityLevel,
        goalType: form.goalType,
        targetWeightKg: needsTarget ? Number(form.targetWeightKg) : undefined,
        timeframeWeeks: needsTarget
          ? (effectiveTimeframeWeeks ?? undefined)
          : undefined,
      });
    } catch {
      return null;
    }
  }, [steps, step, form, needsTarget, effectiveTimeframeWeeks]);

  // Once a plan flags an unsafe rate, "Use suggested timeframe" recomputes
  // with that exact suggested value substituted in — a second lookup
  // rather than plumbing it through the memo above keeps that one branch
  // readable.
  const finalPlan: GoalPlan | null = useMemo(() => {
    if (!plan) return plan;
    if (
      !useSuggestedTimeframe ||
      plan.isRateSafe ||
      !plan.suggestedTimeframeWeeks
    ) {
      return plan;
    }
    try {
      return buildGoalPlan({
        sex: form.sex!,
        age: Number(form.age),
        heightCm: Number(form.heightCm),
        currentWeightKg: Number(form.currentWeightKg),
        activityLevel: form.activityLevel!,
        goalType: form.goalType!,
        targetWeightKg: Number(form.targetWeightKg),
        timeframeWeeks: plan.suggestedTimeframeWeeks,
      });
    } catch {
      return plan;
    }
  }, [plan, useSuggestedTimeframe, form]);

  const finalTimeframeWeeks = useSuggestedTimeframe
    ? (finalPlan?.suggestedTimeframeWeeks ?? plan?.suggestedTimeframeWeeks)
    : effectiveTimeframeWeeks;

  function next() {
    setStep((s) => Math.min(s + 1, steps.length - 1));
  }
  function back() {
    if (step === 0) return;
    setStep((s) => s - 1);
  }

  async function handleFinish() {
    setSubmitting(true);
    setSubmitError(null);
    const payload = {
      age: form.age,
      sex: form.sex,
      heightCm: form.heightCm,
      currentWeightKg: form.currentWeightKg,
      goalType: form.goalType,
      targetWeightKg: needsTarget ? form.targetWeightKg : undefined,
      timeframeWeeks: needsTarget
        ? (finalTimeframeWeeks ?? undefined)
        : undefined,
      activityLevel: form.activityLevel,
    };
    const result =
      mode === "edit"
        ? await updateGoalAction(payload)
        : await submitOnboardingAction(payload);
    if (result.success) {
      router.push(mode === "edit" ? "/goal" : "/dashboard");
      router.refresh();
    } else {
      setSubmitError(result.error ?? "Something went wrong.");
      setSubmitting(false);
    }
  }

  const current = steps[step];
  const total = steps.length;

  if (current === "age") {
    return (
      <StepShell
        step={step}
        total={total}
        title="How old are you?"
        onBack={back}
        canBack={false}
      >
        <BigInput
          value={form.age}
          onChange={(v) => setForm({ ...form, age: v })}
          suffix="years"
          placeholder="30"
          autoFocus
        />
        <PrimaryButton
          onClick={next}
          disabled={!(Number(form.age) >= 13 && Number(form.age) <= 100)}
        >
          Continue
        </PrimaryButton>
      </StepShell>
    );
  }

  if (current === "sex") {
    return (
      <StepShell
        step={step}
        total={total}
        title="What's your sex?"
        subtitle="Used to estimate your energy needs accurately."
        onBack={back}
        canBack
      >
        <div className="flex flex-col gap-2.5">
          <OptionCard
            selected={form.sex === "female"}
            onClick={() => setForm({ ...form, sex: "female" })}
            title="Female"
          />
          <OptionCard
            selected={form.sex === "male"}
            onClick={() => setForm({ ...form, sex: "male" })}
            title="Male"
          />
        </div>
        <PrimaryButton onClick={next} disabled={!form.sex}>
          Continue
        </PrimaryButton>
      </StepShell>
    );
  }

  if (current === "height") {
    return (
      <StepShell
        step={step}
        total={total}
        title="What's your height?"
        onBack={back}
        canBack
      >
        <BigInput
          value={form.heightCm}
          onChange={(v) => setForm({ ...form, heightCm: v })}
          suffix="cm"
          placeholder="170"
          autoFocus
        />
        <PrimaryButton
          onClick={next}
          disabled={
            !(Number(form.heightCm) >= 100 && Number(form.heightCm) <= 250)
          }
        >
          Continue
        </PrimaryButton>
      </StepShell>
    );
  }

  if (current === "weight") {
    return (
      <StepShell
        step={step}
        total={total}
        title="What's your current weight?"
        onBack={back}
        canBack
      >
        <BigInput
          value={form.currentWeightKg}
          onChange={(v) => setForm({ ...form, currentWeightKg: v })}
          suffix="kg"
          placeholder="75"
          autoFocus
        />
        <PrimaryButton
          onClick={next}
          disabled={
            !(
              Number(form.currentWeightKg) >= 30 &&
              Number(form.currentWeightKg) <= 300
            )
          }
        >
          Continue
        </PrimaryButton>
      </StepShell>
    );
  }

  if (current === "goal") {
    return (
      <StepShell
        step={step}
        total={total}
        title="What's your goal?"
        onBack={back}
        canBack
      >
        <div className="flex flex-col gap-2.5">
          {GOAL_OPTIONS.map((opt) => (
            <OptionCard
              key={opt.value}
              selected={form.goalType === opt.value}
              onClick={() =>
                setForm({
                  ...form,
                  goalType: opt.value,
                  ...(opt.value === "maintain"
                    ? {
                        targetWeightKg: "",
                        timeframeWeeks: null,
                        customWeeks: "",
                      }
                    : {}),
                })
              }
              title={opt.label}
              sub={opt.hint}
            />
          ))}
        </div>
        <PrimaryButton onClick={next} disabled={!form.goalType}>
          Continue
        </PrimaryButton>
      </StepShell>
    );
  }

  if (current === "target") {
    const verb = form.goalType === "lose" ? "lose" : "gain";
    return (
      <StepShell
        step={step}
        total={total}
        title="What's your target weight?"
        onBack={back}
        canBack
      >
        <BigInput
          value={form.targetWeightKg}
          onChange={(v) => setForm({ ...form, targetWeightKg: v })}
          suffix="kg"
          placeholder={form.currentWeightKg || "70"}
          autoFocus
        />
        {form.targetWeightKg && form.currentWeightKg && (
          <p className="text-sm text-text-muted">
            That&apos;s {verb === "lose" ? "losing" : "gaining"} about{" "}
            <span className="num font-semibold text-text">
              {Math.abs(
                Number(form.targetWeightKg) - Number(form.currentWeightKg),
              ).toFixed(1)}{" "}
              kg
            </span>
            .
          </p>
        )}
        <PrimaryButton
          onClick={next}
          disabled={
            !(
              Number(form.targetWeightKg) >= 30 &&
              Number(form.targetWeightKg) <= 300
            )
          }
        >
          Continue
        </PrimaryButton>
      </StepShell>
    );
  }

  if (current === "timeframe") {
    return (
      <StepShell
        step={step}
        total={total}
        title="When would you like to reach your target?"
        onBack={back}
        canBack
      >
        <div className="grid grid-cols-3 gap-2">
          {TIMEFRAME_OPTIONS.map((opt) => (
            <button
              key={opt.weeks}
              type="button"
              onClick={() => setForm({ ...form, timeframeWeeks: opt.weeks })}
              className={`rounded-2xl border-2 py-3 text-center text-sm font-bold transition-colors ${
                form.timeframeWeeks === opt.weeks
                  ? "border-accent bg-accent-soft"
                  : "border-border bg-surface"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setForm({ ...form, timeframeWeeks: -1 })}
          className={`rounded-2xl border-2 px-4 py-3 text-left text-sm font-bold transition-colors ${
            form.timeframeWeeks === -1
              ? "border-accent bg-accent-soft"
              : "border-border bg-surface"
          }`}
        >
          Custom
        </button>
        {form.timeframeWeeks === -1 && (
          <BigInput
            value={form.customWeeks}
            onChange={(v) => setForm({ ...form, customWeeks: v })}
            suffix="weeks"
            placeholder="16"
            autoFocus
          />
        )}
        <PrimaryButton
          onClick={next}
          disabled={!effectiveTimeframeWeeks || effectiveTimeframeWeeks < 1}
        >
          Continue
        </PrimaryButton>
      </StepShell>
    );
  }

  if (current === "activity") {
    return (
      <StepShell
        step={step}
        total={total}
        title="How active are you?"
        onBack={back}
        canBack
      >
        <div className="flex flex-col gap-2.5">
          {ACTIVITY_OPTIONS.map((opt) => (
            <OptionCard
              key={opt.value}
              selected={form.activityLevel === opt.value}
              onClick={() => setForm({ ...form, activityLevel: opt.value })}
              title={opt.title}
              sub={opt.sub}
            />
          ))}
        </div>
        <PrimaryButton onClick={next} disabled={!form.activityLevel}>
          See my plan
        </PrimaryButton>
      </StepShell>
    );
  }

  // "summary" — the goal summary screen, shown before anything is saved.
  const displayPlan = finalPlan;
  return (
    <div className="flex min-h-[70vh] flex-col gap-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={back}
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-text-muted"
        >
          ‹
        </button>
        <div className="flex flex-1 gap-1.5">
          {Array.from({ length: total }).map((_, i) => (
            <div key={i} className="h-1.5 flex-1 rounded-full bg-accent" />
          ))}
        </div>
      </div>

      <h1 className="text-2xl font-bold">Your plan</h1>

      {!displayPlan ? (
        <p className="text-sm text-text-muted">
          Couldn&apos;t compute a plan — go back and check your answers.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {needsTarget && (
            <div className="rounded-2xl border border-border bg-surface p-4">
              <p className="text-xs font-bold tracking-wide text-text-faint uppercase">
                Your goal
              </p>
              <p className="mt-1 text-lg font-bold">
                {form.goalType === "lose" ? "Lose" : "Gain"}{" "}
                {Math.abs(
                  Number(form.targetWeightKg) - Number(form.currentWeightKg),
                ).toFixed(1)}{" "}
                kg
              </p>
              <p className="num text-sm text-text-muted">
                {Number(form.currentWeightKg).toFixed(1)} kg →{" "}
                {Number(form.targetWeightKg).toFixed(1)} kg
              </p>
            </div>
          )}

          {needsTarget && !displayPlan.isRateSafe && (
            <div className="flex flex-col gap-2.5 rounded-2xl bg-info-soft p-4 text-info">
              <p className="text-sm font-semibold">
                Your target may be faster than recommended. Consider extending
                your timeline.
              </p>
              {displayPlan.suggestedTimeframeWeeks &&
                !useSuggestedTimeframe && (
                  <button
                    type="button"
                    onClick={() => setUseSuggestedTimeframe(true)}
                    className="w-fit rounded-full bg-info px-4 py-2 text-xs font-bold text-accent-ink"
                  >
                    Use {displayPlan.suggestedTimeframeWeeks}-week timeline
                    instead
                  </button>
                )}
            </div>
          )}

          {needsTarget && useSuggestedTimeframe && (
            <p className="text-xs text-text-muted">
              Using the suggested {finalTimeframeWeeks}-week timeline.
            </p>
          )}

          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold text-text-muted">
                Daily calorie target
              </span>
              <span className="num text-3xl font-bold text-accent">
                {displayPlan.dailyCalorieTarget.toLocaleString()}
              </span>
            </div>
            {displayPlan.wasClampedToSafeFloor && (
              <p className="text-xs text-info">
                Kept at a safe minimum — the pace you asked for would have
                needed fewer calories than we recommend eating.
              </p>
            )}
            <div className="flex items-center justify-between border-t border-border pt-3 text-sm text-text-muted">
              <span>Estimated maintenance</span>
              <span className="num">
                {displayPlan.maintenanceCalories.toLocaleString()} kcal
              </span>
            </div>
            {displayPlan.weeklyRateKg != null && (
              <p className="text-sm text-text-muted">
                You&apos;re aiming for about{" "}
                <span className="num font-semibold text-text">
                  {Math.abs(displayPlan.weeklyRateKg).toFixed(2)} kg
                </span>{" "}
                per week.
              </p>
            )}
          </div>

          <div className="flex items-center justify-between rounded-2xl bg-surface-2 p-4">
            <div>
              <p className="text-xs font-bold tracking-wide text-text-faint uppercase">
                Your BMI
              </p>
              <p className="num text-xl font-bold">{displayPlan.bmi}</p>
            </div>
            <p className="max-w-[16ch] text-right text-[11px] text-text-faint">
              BMI is a screening measure and doesn&apos;t tell the whole story
              about your health.
            </p>
          </div>

          {submitError && <p className="text-sm text-err">{submitError}</p>}

          <PrimaryButton onClick={handleFinish} disabled={submitting}>
            {submitting
              ? "Saving…"
              : mode === "edit"
                ? "Save changes"
                : "Get started"}
          </PrimaryButton>
        </div>
      )}
    </div>
  );
}

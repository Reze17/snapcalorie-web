import { DateTime } from "luxon";
import Link from "next/link";
import { redirect } from "next/navigation";
import { computeDailyMetrics } from "@/lib/daily-metrics";
import { evaluateDayStatus } from "@/lib/day-feedback";
import { getEffectiveUser } from "@/server/dev-bypass";
import { instantToLocalDate } from "@/server/lib/timezone";
import { getDailySummary } from "@/server/repositories/daily-summaries";
import { getEntriesWithItemsForUserDay } from "@/server/repositories/meal-entries";
import { getUserById } from "@/server/repositories/users";
import { getLatestWeight } from "@/server/repositories/weight-logs";
import { createPresignedDownloadUrl } from "@/server/storage/presign";

const MEAL_PERIODS = ["Breakfast", "Lunch", "Dinner"] as const;

function normalizeDateParam(
  dateParam: string | undefined,
  todayLocal: string,
): string {
  if (!dateParam) return todayLocal;
  const parsed = DateTime.fromISO(dateParam);
  if (!parsed.isValid) return todayLocal;
  const isoDate = parsed.toISODate();
  if (!isoDate || isoDate > todayLocal) return todayLocal;
  return isoDate;
}

function formatDateHeading(dateStr: string, isToday: boolean): string {
  if (isToday) return "Today";
  return DateTime.fromISO(dateStr).toFormat("EEE, MMM d");
}

function formatTime(instant: Date, timezone: string): string {
  return DateTime.fromJSDate(instant).setZone(timezone).toFormat("h:mm a");
}

/**
 * Purely a display label, computed from each entry's own logged_at at
 * render time — never stored, never a schema field. The data model
 * deliberately has no meal-type concept (see CLAUDE.md, Phase 7); this
 * keeps it that way while still meeting the "grouped by meal" UX request.
 */
function timeOfDayLabel(
  instant: Date,
  timezone: string,
): (typeof MEAL_PERIODS)[number] | "Snack" {
  const hour = DateTime.fromJSDate(instant).setZone(timezone).hour;
  if (hour < 11) return "Breakfast";
  if (hour < 16) return "Lunch";
  if (hour < 21) return "Dinner";
  return "Snack";
}

// A few generic, non-personalized examples — this app has no food-
// preference system yet, so these are deliberately framed as "lighter
// ideas" rather than claimed as tailored to the user.
const LIGHT_MEAL_IDEAS = [
  "Greek yogurt + berries",
  "Vegetable soup",
  "Eggs + vegetables",
  "Small chicken salad",
];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const effectiveUser = await getEffectiveUser();
  if (!effectiveUser) {
    redirect("/login");
  }

  const user = await getUserById(effectiveUser.id);
  if (!user) {
    redirect("/login");
  }

  const todayLocal = instantToLocalDate(new Date(), user.timezone);
  const { date: dateParam } = await searchParams;
  const viewDate = normalizeDateParam(dateParam, todayLocal);
  const isToday = viewDate === todayLocal;

  const summary = await getDailySummary(user.id, viewDate);
  const consumed = summary ? Number(summary.consumedCalories) : 0;
  const target = summary ? summary.targetCalories : user.dailyCalorieTarget;
  const metrics = computeDailyMetrics(consumed, target);
  const dayStatus = isToday ? evaluateDayStatus(consumed, target) : null;

  const needsGoalCard = user.goalType === "lose" || user.goalType === "gain";
  const latestWeight = needsGoalCard ? await getLatestWeight(user.id) : null;

  const entriesWithItems = await getEntriesWithItemsForUserDay(
    user.id,
    viewDate,
  );
  const rows = await Promise.all(
    entriesWithItems.map(async ({ entry, items }) => ({
      entry,
      items,
      thumbnailUrl: await createPresignedDownloadUrl(entry.imageStoragePath),
    })),
  );

  // Groups stay in the same chronological order the query already
  // returned rows in — this only clusters same-period rows visually, it
  // never reorders entries relative to each other. Breakfast/Lunch/Dinner
  // always get their own section (with an add-prompt when empty, today
  // only); Snack only appears when something's actually been logged
  // there — there's nothing sensible to "add a snack" prompt toward.
  const byPeriod = new Map<string, typeof rows>();
  for (const row of rows) {
    const label = timeOfDayLabel(row.entry.loggedAt, user.timezone);
    const list = byPeriod.get(label) ?? [];
    list.push(row);
    byPeriod.set(label, list);
  }
  const sections = [
    ...MEAL_PERIODS.map((label) => ({
      label,
      rows: byPeriod.get(label) ?? [],
    })),
    ...(byPeriod.has("Snack")
      ? [{ label: "Snack", rows: byPeriod.get("Snack")! }]
      : []),
  ];

  const prevDate = DateTime.fromISO(viewDate).minus({ days: 1 }).toISODate();
  const nextDate = DateTime.fromISO(viewDate).plus({ days: 1 }).toISODate();
  const progressWidth = Math.min(
    100,
    Math.max(0, metrics.achievementPercentage),
  );
  const remainingLabel =
    metrics.remaining >= 0
      ? `${metrics.remaining.toLocaleString()} kcal remaining`
      : `${Math.abs(metrics.remaining).toLocaleString()} kcal over target`;

  return (
    <div className="flex flex-col gap-6">
      {!user.onboardingCompletedAt && (
        <Link
          href="/onboarding"
          className="flex items-center justify-between rounded-2xl bg-accent-soft px-4 py-3 text-accent-strong"
        >
          <span className="text-sm font-semibold">
            Set up your personalized goal
          </span>
          <span>›</span>
        </Link>
      )}

      <div className="flex items-center justify-between">
        <Link
          href={`/dashboard?date=${prevDate}`}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-text-muted"
          aria-label="Previous day"
        >
          ‹
        </Link>
        <span className="text-xs font-semibold tracking-wide text-text-faint uppercase">
          {formatDateHeading(viewDate, isToday)}
        </span>
        {isToday ? (
          <span
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-text-faint/50"
            aria-hidden="true"
          >
            ›
          </span>
        ) : (
          <Link
            href={`/dashboard?date=${nextDate}`}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-text-muted"
            aria-label="Next day"
          >
            ›
          </Link>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-baseline gap-2">
          <span className="num text-[40px] leading-none font-semibold">
            {metrics.consumed.toLocaleString()}
          </span>
          <span className="num text-sm text-text-faint">
            / {metrics.target.toLocaleString()} kcal
          </span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${progressWidth}%` }}
          />
        </div>
        <div className="flex items-center gap-1.5 text-sm text-text-muted">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-good" />
          {remainingLabel}
        </div>
      </div>

      {needsGoalCard && user.targetWeightKg && latestWeight && (
        <Link
          href="/goal"
          className="flex items-center justify-between rounded-2xl border border-border bg-surface p-4"
        >
          <div>
            <p className="text-xs font-bold tracking-wide text-text-faint uppercase">
              Your goal
            </p>
            <p className="text-sm font-bold">
              {user.goalType === "lose" ? "Lose" : "Gain"}{" "}
              {Math.abs(
                Number(user.targetWeightKg) - Number(latestWeight.weightKg),
              ).toFixed(1)}{" "}
              kg
            </p>
            <p className="num text-xs text-text-muted">
              {Number(latestWeight.weightKg).toFixed(1)} kg →{" "}
              {Number(user.targetWeightKg).toFixed(1)} kg
            </p>
          </div>
          <span className="text-text-muted">›</span>
        </Link>
      )}

      {dayStatus && dayStatus.kind === "over" && (
        <div className="flex flex-col gap-1.5 rounded-2xl bg-info-soft p-4 text-info">
          <p className="text-sm font-semibold">
            You&apos;ve reached today&apos;s calorie target
          </p>
          <p className="num text-xs">
            You&apos;ve logged {metrics.consumed.toLocaleString()} /{" "}
            {metrics.target.toLocaleString()} kcal — about{" "}
            {dayStatus.overBy.toLocaleString()} kcal over your target today.
          </p>
          <p className="text-xs">
            If you&apos;re still hungry later, consider a light, nutrient-dense
            option and listen to your hunger cues.
          </p>
        </div>
      )}

      {dayStatus && dayStatus.kind === "near_target" && (
        <div className="flex flex-col gap-2 rounded-2xl bg-surface-2 p-4">
          <p className="text-sm font-semibold">
            {dayStatus.remaining.toLocaleString()} kcal remaining
          </p>
          <p className="text-xs text-text-muted">
            If you&apos;re planning your next meal, consider something around
            this amount. A few lighter ideas:
          </p>
          <ul className="flex flex-col gap-1 text-xs text-text-muted">
            {LIGHT_MEAL_IDEAS.map((idea) => (
              <li key={idea}>• {idea}</li>
            ))}
          </ul>
        </div>
      )}

      {dayStatus && dayStatus.kind === "under" && (
        <div className="flex flex-col gap-1.5 rounded-2xl bg-surface-2 p-4">
          <p className="text-sm font-semibold">
            You&apos;ve logged {dayStatus.consumed.toLocaleString()} kcal today
          </p>
          <p className="text-xs text-text-muted">
            That&apos;s significantly below your daily target. Make sure
            you&apos;re getting enough food and nutrition.
          </p>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-6 py-10 text-center">
          <svg
            viewBox="0 0 24 24"
            className="h-9 w-9 text-text-faint"
            aria-hidden="true"
          >
            <rect
              x="3"
              y="7"
              width="18"
              height="13"
              rx="3"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
            />
            <path
              d="M8 7l1.5-3h5L16 7"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
            />
            <circle
              cx="12"
              cy="13.5"
              r="3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
            />
          </svg>
          <p className="text-sm font-semibold">
            {isToday ? "Nothing logged yet" : "No meals were logged"}
          </p>
          {isToday && (
            <>
              <p className="max-w-[22ch] text-xs text-text-muted">
                Tap Scan to log your first meal — it takes about ten seconds.
              </p>
              <Link
                href="/capture"
                className="mt-1 rounded-full bg-accent px-5 py-2 text-sm font-bold text-accent-ink"
              >
                Scan a meal
              </Link>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {sections.map((section) => (
            <div key={section.label} className="flex flex-col gap-2">
              <p className="px-0.5 text-[11px] font-bold tracking-wide text-text-faint uppercase">
                {section.label}
              </p>
              {section.rows.map(({ entry, items, thumbnailUrl }) => (
                <Link
                  key={entry.entryId}
                  href={`/entries/${entry.entryId}`}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- presigned S3 URL, not something next/image can optimize */}
                  <img
                    src={thumbnailUrl}
                    alt=""
                    className="h-11 w-11 shrink-0 rounded-xl object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {items.map((item) => item.foodName).join(", ") || "Meal"}
                    </p>
                    <p className="truncate text-xs text-text-muted">
                      {formatTime(entry.loggedAt, user.timezone)}
                    </p>
                  </div>
                  <span className="num shrink-0 text-sm text-text-muted">
                    {entry.totalCalories} kcal
                  </span>
                </Link>
              ))}
              {section.rows.length === 0 && isToday && (
                <Link
                  href="/capture"
                  className="flex items-center justify-center rounded-2xl border border-dashed border-border py-3 text-xs font-semibold text-text-muted"
                >
                  + Add {section.label.toLowerCase()}
                </Link>
              )}
            </div>
          ))}
          <p className="px-0.5 text-center text-[10.5px] text-text-faint">
            Grouped by time of day for display only — nothing about how
            it&apos;s stored changes.
          </p>
        </div>
      )}
    </div>
  );
}

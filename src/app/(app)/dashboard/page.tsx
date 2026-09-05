import { DateTime } from "luxon";
import Link from "next/link";
import { redirect } from "next/navigation";
import { computeDailyMetrics } from "@/lib/daily-metrics";
import { getEffectiveUser } from "@/server/dev-bypass";
import { instantToLocalDate } from "@/server/lib/timezone";
import { getDailySummary } from "@/server/repositories/daily-summaries";
import { getEntriesWithItemsForUserDay } from "@/server/repositories/meal-entries";
import { getUserById } from "@/server/repositories/users";
import { createPresignedDownloadUrl } from "@/server/storage/presign";

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

  const prevDate = DateTime.fromISO(viewDate).minus({ days: 1 }).toISODate();
  const nextDate = DateTime.fromISO(viewDate).plus({ days: 1 }).toISODate();
  const progressWidth = Math.min(
    100,
    Math.max(0, metrics.achievementPercentage),
  );

  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Link
          href={`/dashboard?date=${prevDate}`}
          className="flex h-11 items-center rounded border border-white/20 px-3 text-sm hover:bg-white/10"
        >
          ← Prev
        </Link>
        <span className="text-sm font-medium">
          {formatDateHeading(viewDate, isToday)}
        </span>
        {isToday ? (
          <span className="flex h-11 items-center rounded border border-white/10 px-3 text-sm text-[var(--foreground)]/30">
            Next →
          </span>
        ) : (
          <Link
            href={`/dashboard?date=${nextDate}`}
            className="flex h-11 items-center rounded border border-white/20 px-3 text-sm hover:bg-white/10"
          >
            Next →
          </Link>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-white/10 p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-semibold">
            {metrics.consumed} kcal
          </span>
          <span className="text-sm text-[var(--foreground)]/60">
            of {metrics.target} kcal
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full bg-white/50"
            style={{ width: `${progressWidth}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-sm text-[var(--foreground)]/70">
          <span>
            {metrics.remaining >= 0
              ? `${metrics.remaining} kcal remaining`
              : `${Math.abs(metrics.remaining)} kcal over target`}
          </span>
          <span>{metrics.achievementPercentage}%</span>
        </div>
      </div>

      <Link
        href="/capture"
        className="w-full rounded bg-white/10 px-4 py-3 text-center text-sm font-medium hover:bg-white/20"
      >
        Add meal
      </Link>

      <div className="flex flex-col gap-2">
        {rows.length === 0 ? (
          <p className="text-sm text-[var(--foreground)]/70">
            {isToday
              ? "No meals logged yet today. Tap “Add meal” to get started."
              : "No meals were logged on this day."}
          </p>
        ) : (
          rows.map(({ entry, items, thumbnailUrl }) => (
            <Link
              key={entry.entryId}
              href={`/entries/${entry.entryId}`}
              className="flex items-center gap-3 rounded-lg border border-white/10 p-3 hover:bg-white/5"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- presigned S3 URL, not something next/image can optimize */}
              <img
                src={thumbnailUrl}
                alt=""
                className="h-12 w-12 shrink-0 rounded object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {items.map((item) => item.foodName).join(", ") || "Meal"}
                </p>
                <p className="truncate text-xs text-[var(--foreground)]/60">
                  {formatTime(entry.loggedAt, user.timezone)} ·{" "}
                  {entry.totalCalories} kcal · {entry.totalProtein}g P ·{" "}
                  {entry.totalCarbs}g C · {entry.totalFat}g F
                </p>
              </div>
            </Link>
          ))
        )}
      </div>
    </main>
  );
}

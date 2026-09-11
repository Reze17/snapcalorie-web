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

/**
 * Purely a display label, computed from each entry's own logged_at at
 * render time — never stored, never a schema field. The data model
 * deliberately has no meal-type concept (see CLAUDE.md, Phase 7); this
 * keeps it that way while still meeting the "grouped by meal" UX request.
 */
function timeOfDayLabel(instant: Date, timezone: string): string {
  const hour = DateTime.fromJSDate(instant).setZone(timezone).hour;
  if (hour < 11) return "Breakfast";
  if (hour < 16) return "Lunch";
  if (hour < 21) return "Dinner";
  return "Snack";
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

  // Groups stay in the same chronological order the query already
  // returned rows in — this only clusters same-period rows visually, it
  // never reorders entries relative to each other.
  const groups: { label: string; rows: typeof rows }[] = [];
  for (const row of rows) {
    const label = timeOfDayLabel(row.entry.loggedAt, user.timezone);
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.rows.push(row);
    } else {
      groups.push({ label, rows: [row] });
    }
  }

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
          {groups.map((group) => (
            <div key={group.label} className="flex flex-col gap-2">
              <p className="px-0.5 text-[11px] font-bold tracking-wide text-text-faint uppercase">
                {group.label}
              </p>
              {group.rows.map(({ entry, items, thumbnailUrl }) => (
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

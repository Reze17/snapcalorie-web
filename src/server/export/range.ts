import { DateTime } from "luxon";
import { getEarliestEntryLocalDate } from "@/server/repositories/export";
import { exportDateParamSchema } from "@/server/validation/export";

// Ranges longer than this go through the async job pipeline instead of
// blocking the request (FR-10 item 5). 90 days keeps the common "last
// month" / "last quarter" cases synchronous while a "since I started"
// export on a long-lived account goes async.
export const ASYNC_JOB_THRESHOLD_DAYS = 90;

export function daysBetweenInclusive(fromDate: string, toDate: string): number {
  const from = DateTime.fromISO(fromDate);
  const to = DateTime.fromISO(toDate);
  return Math.floor(to.diff(from, "days").days) + 1;
}

/**
 * Whether an export of this range should be handed to the detached async
 * job pipeline (`void runExportJob(...)`) rather than generated inline.
 *
 * Large ranges normally go async — EXCEPT on a serverless host, where a
 * detached promise is not guaranteed to keep running once the HTTP
 * response is sent (see CLAUDE.md "Export pipeline"). On Vercel
 * (`process.env.VERCEL === "1"`), or when `EXPORT_FORCE_SYNC=true` is set
 * explicitly, every export runs synchronously instead; the routes raise
 * their `maxDuration` so a big range still has time to finish in-request.
 */
export function shouldExportAsync(fromDate: string, toDate: string): boolean {
  if (process.env.VERCEL === "1" || process.env.EXPORT_FORCE_SYNC === "true") {
    return false;
  }
  return daysBetweenInclusive(fromDate, toDate) > ASYNC_JOB_THRESHOLD_DAYS;
}

function clampDateParam(
  param: string | null,
  fallback: string,
  max: string,
): string {
  // Reject anything that doesn't even look like a date outright — the
  // zod check here is defense-in-depth against a garbage/oversized query
  // value, on top of the lenient fallback-to-default behavior below for
  // an otherwise well-formed but out-of-range date.
  const validShape = exportDateParamSchema.safeParse(param);
  if (!validShape.success || !validShape.data) return fallback;

  const parsed = DateTime.fromISO(validShape.data);
  const iso = parsed.isValid ? parsed.toISODate() : null;
  if (!iso) return fallback;
  return iso > max ? max : iso;
}

export interface ExportRange {
  fromDate: string;
  toDate: string;
}

/**
 * Resolves the requested export range from query params, always clamped
 * server-side to never exceed "today" in the user's own timezone (same
 * pattern as the dashboard's date nav) regardless of what the client sends.
 * With no "from" param, defaults to the user's very first entry ("all
 * time"); with no entries at all, collapses to a single (empty) day.
 */
export async function resolveExportRange(
  userId: string,
  timezone: string,
  todayLocal: string,
  searchParams: URLSearchParams,
): Promise<ExportRange> {
  const toDate = clampDateParam(searchParams.get("to"), todayLocal, todayLocal);
  const earliest = await getEarliestEntryLocalDate(userId);
  const defaultFrom = earliest ?? toDate;
  let fromDate = clampDateParam(searchParams.get("from"), defaultFrom, toDate);
  if (fromDate > toDate) {
    fromDate = toDate;
  }
  return { fromDate, toDate };
}

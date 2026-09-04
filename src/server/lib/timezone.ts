import { DateTime } from "luxon";

/**
 * Resolves the [start, end) UTC instant range that corresponds to a
 * calendar day (YYYY-MM-DD) in the given IANA timezone. Never derive a
 * "day" from server-local or UTC time directly — always go through this.
 */
export function localDayRangeUtc(
  timezone: string,
  localDate: string,
): { startUtc: Date; endUtc: Date } {
  const start = DateTime.fromISO(localDate, { zone: timezone }).startOf("day");
  if (!start.isValid) {
    throw new Error(
      `Invalid local date "${localDate}" for timezone "${timezone}": ${start.invalidReason}`,
    );
  }
  const end = start.plus({ days: 1 });
  return { startUtc: start.toUTC().toJSDate(), endUtc: end.toUTC().toJSDate() };
}

/** Resolves which local calendar day (YYYY-MM-DD) a UTC instant falls on. */
export function instantToLocalDate(instant: Date, timezone: string): string {
  const isoDate = DateTime.fromJSDate(instant, { zone: timezone }).toISODate();
  if (!isoDate) {
    throw new Error(
      `Could not resolve local date for ${instant.toISOString()} in timezone "${timezone}"`,
    );
  }
  return isoDate;
}

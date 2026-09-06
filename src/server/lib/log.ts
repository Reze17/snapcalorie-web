import { db } from "@/db/client";
import { latencyEvents } from "@/db/schema";

/**
 * The ONE place structured application logging happens. Single-line JSON so
 * it's grep/parse-able in any log aggregator without a schema. Never pass
 * a storage key, presigned URL, or raw user id in `fields` — see the
 * Phase 10 security-pass note in CLAUDE.md.
 */
export function logEvent(event: string, fields: Record<string, unknown> = {}) {
  console.info(
    JSON.stringify({ event, ...fields, ts: new Date().toISOString() }),
  );
}

/**
 * Persists one timed pipeline stage (FRD §6 latency NFR) so /admin/metrics
 * can compute real p50/p75/p95 instead of eyeballing logs. Fire-and-forget
 * on purpose — a metrics write must never slow down or fail the request it
 * measures. entryId is optional since some stages (vision inference) run
 * before a meal_entries row exists.
 */
export function recordLatency(
  event: string,
  durationMs: number,
  entryId?: string,
): void {
  logEvent(event, { durationMs, entryId });
  db.insert(latencyEvents)
    .values({ event, durationMs, entryId: entryId ?? null })
    .catch((err) => {
      console.error(
        JSON.stringify({
          event: "latency_write_failed",
          cause: err instanceof Error ? err.message : String(err),
        }),
      );
    });
}

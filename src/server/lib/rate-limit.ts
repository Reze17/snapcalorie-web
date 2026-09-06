import { lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { rateLimitCounters } from "@/db/schema";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

/**
 * Fixed-window rate limiting, Postgres-backed (this stack has no Redis).
 * `windowStart` is the start of the current `windowSeconds`-long window,
 * floored to a multiple of windowSeconds since the epoch — every caller
 * hitting the same window collapses onto the same row, incremented
 * atomically via `ON CONFLICT ... DO UPDATE ... count + 1 RETURNING count`
 * so concurrent requests can't race past the limit.
 *
 * Simpler than a sliding-window/token-bucket algorithm, and correct enough
 * at this app's scale — a caller can burst up to 2x the limit right at a
 * window boundary, which is an acceptable tradeoff FR-10/§6 doesn't rule out.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStartMs =
    Math.floor(now / (windowSeconds * 1000)) * (windowSeconds * 1000);
  const windowStart = new Date(windowStartMs);
  const resetAt = new Date(windowStartMs + windowSeconds * 1000);

  const [row] = await db
    .insert(rateLimitCounters)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimitCounters.key, rateLimitCounters.windowStart],
      set: { count: sql`${rateLimitCounters.count} + 1` },
    })
    .returning({ count: rateLimitCounters.count });

  const count = row?.count ?? 1;
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetAt,
  };
}

/** Best-effort cleanup for old windows — call occasionally, never on the request hot path. */
export async function pruneOldRateLimitWindows(olderThan: Date): Promise<void> {
  await db
    .delete(rateLimitCounters)
    .where(lt(rateLimitCounters.windowStart, olderThan));
}

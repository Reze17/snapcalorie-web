// @vitest-environment node
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { rateLimitCounters } from "@/db/schema";
import { checkRateLimit } from "./rate-limit";

describe("checkRateLimit", () => {
  const testKeys: string[] = [];

  afterAll(async () => {
    for (const key of testKeys) {
      await db.delete(rateLimitCounters).where(eq(rateLimitCounters.key, key));
    }
  });

  it("allows requests under the limit and reports remaining correctly", async () => {
    const key = `test:${randomUUID()}`;
    testKeys.push(key);

    const first = await checkRateLimit(key, 3, 3600);
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(2);

    const second = await checkRateLimit(key, 3, 3600);
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(1);
  });

  it("blocks requests once the limit is reached within the same window", async () => {
    const key = `test:${randomUUID()}`;
    testKeys.push(key);

    await checkRateLimit(key, 2, 3600);
    await checkRateLimit(key, 2, 3600);
    const third = await checkRateLimit(key, 2, 3600);

    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
  });

  it("keeps separate counters for different keys", async () => {
    const keyA = `test:${randomUUID()}`;
    const keyB = `test:${randomUUID()}`;
    testKeys.push(keyA, keyB);

    await checkRateLimit(keyA, 1, 3600);
    const resultA = await checkRateLimit(keyA, 1, 3600);
    const resultB = await checkRateLimit(keyB, 1, 3600);

    expect(resultA.allowed).toBe(false);
    expect(resultB.allowed).toBe(true);
  });

  it("resets once a new window starts", async () => {
    const key = `test:${randomUUID()}`;
    testKeys.push(key);

    // A 1-second window: the first call consumes it, then after the window
    // elapses a fresh call should land in a new window and be allowed again.
    const first = await checkRateLimit(key, 1, 1);
    expect(first.allowed).toBe(true);

    const blocked = await checkRateLimit(key, 1, 1);
    expect(blocked.allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 1100));

    const afterWindow = await checkRateLimit(key, 1, 1);
    expect(afterWindow.allowed).toBe(true);
  });
});

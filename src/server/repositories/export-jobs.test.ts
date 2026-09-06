// @vitest-environment node
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import {
  createExportJob,
  getOwnedExportJob,
  updateExportJobStatus,
} from "./export-jobs";

describe("export job ownership (FR-10 cross-user protection)", () => {
  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    const [userA] = await db
      .insert(users)
      .values({ email: `test-a-${randomUUID()}@snapcalorie.dev` })
      .returning();
    const [userB] = await db
      .insert(users)
      .values({ email: `test-b-${randomUUID()}@snapcalorie.dev` })
      .returning();
    userAId = userA.id;
    userBId = userB.id;
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, userAId));
    await db.delete(users).where(eq(users.id, userBId));
  });

  it("returns the job for its owner", async () => {
    const job = await createExportJob({
      userId: userAId,
      format: "csv",
      fromDate: "2026-01-01",
      toDate: "2026-01-31",
    });

    const owned = await getOwnedExportJob(job.jobId, userAId);
    expect(owned?.jobId).toBe(job.jobId);
  });

  it("returns nothing for a different user — user A can never fetch user B's export job", async () => {
    const job = await createExportJob({
      userId: userAId,
      format: "pdf",
      fromDate: "2026-01-01",
      toDate: "2026-01-31",
    });

    const asOwner = await getOwnedExportJob(job.jobId, userAId);
    const asOtherUser = await getOwnedExportJob(job.jobId, userBId);

    expect(asOwner).toBeDefined();
    expect(asOtherUser).toBeUndefined();
  });

  it("returns nothing for a jobId that doesn't exist at all", async () => {
    const result = await getOwnedExportJob(randomUUID(), userAId);
    expect(result).toBeUndefined();
  });

  it("a job only becomes ready with a storage key once processed", async () => {
    const job = await createExportJob({
      userId: userAId,
      format: "csv",
      fromDate: "2026-02-01",
      toDate: "2026-02-28",
    });
    expect(job.status).toBe("pending");
    expect(job.storageKey).toBeNull();

    await updateExportJobStatus(job.jobId, {
      status: "ready",
      storageKey: `users/${userAId}/exports/${job.jobId}.csv`,
      completedAt: new Date(),
    });

    const updated = await getOwnedExportJob(job.jobId, userAId);
    expect(updated?.status).toBe("ready");
    expect(updated?.storageKey).toBe(
      `users/${userAId}/exports/${job.jobId}.csv`,
    );

    // Still invisible to a different user even once ready.
    const asOtherUser = await getOwnedExportJob(job.jobId, userBId);
    expect(asOtherUser).toBeUndefined();
  });
});

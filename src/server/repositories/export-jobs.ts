import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { exportJobs } from "@/db/schema";

export type ExportFormat = "csv" | "pdf";
export type ExportJobStatus = "pending" | "processing" | "ready" | "failed";

export interface CreateExportJobInput {
  userId: string;
  format: ExportFormat;
  fromDate: string;
  toDate: string;
}

export async function createExportJob(input: CreateExportJobInput) {
  const [job] = await db
    .insert(exportJobs)
    .values({
      userId: input.userId,
      format: input.format,
      fromDate: input.fromDate,
      toDate: input.toDate,
    })
    .returning();
  return job;
}

export interface ExportJobUpdate {
  status: ExportJobStatus;
  storageKey?: string;
  errorMessage?: string;
  completedAt?: Date;
}

export async function updateExportJobStatus(
  jobId: string,
  update: ExportJobUpdate,
) {
  await db.update(exportJobs).set(update).where(eq(exportJobs.jobId, jobId));
}

/**
 * The ONLY way any route should look up a job. Scoping the WHERE clause to
 * userId (rather than fetching by jobId and checking .userId afterward in
 * application code) means a mistyped/omitted check can't silently leak
 * another user's job — a mismatched jobId/userId pair simply doesn't match
 * any row. See CLAUDE.md's export security note before adding a new
 * job-reading route.
 */
export async function getOwnedExportJob(jobId: string, userId: string) {
  const [job] = await db
    .select()
    .from(exportJobs)
    .where(and(eq(exportJobs.jobId, jobId), eq(exportJobs.userId, userId)));
  return job;
}

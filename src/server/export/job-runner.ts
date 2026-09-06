import {
  CSV_HEADERS,
  buildExportDayGroups,
  buildExportRows,
  csvRowLine,
  exportRowToCsvFields,
} from "@/lib/export";
import { generateExportPdf } from "@/server/export/pdf";
import { getExportData } from "@/server/repositories/export";
import {
  getOwnedExportJob,
  updateExportJobStatus,
} from "@/server/repositories/export-jobs";
import { getUserById } from "@/server/repositories/users";
import { buildExportKey } from "@/server/storage/presign";
import { putObjectBuffer } from "@/server/storage/objects";

export function buildCsvBuffer(
  entries: Parameters<typeof buildExportRows>[0],
  summariesByDate: Parameters<typeof buildExportRows>[1],
  fallbackTarget: number,
): Buffer {
  const rows = buildExportRows(entries, summariesByDate, fallbackTarget);
  const header = CSV_HEADERS.join(",") + "\r\n";
  const body = rows
    .map((row) => csvRowLine(exportRowToCsvFields(row)))
    .join("");
  // UTF-8 BOM so Excel detects the encoding and renders accented
  // characters correctly instead of mojibake.
  return Buffer.from("\uFEFF" + header + body, "utf-8");
}

/**
 * Runs one export job end to end: fetch data, generate the file, upload it,
 * mark the job ready (or failed). Deliberately not awaited by the route
 * that creates the job — that route responds as soon as the job row exists
 * so ranges over 90 days don't hold the HTTP request open. This project has
 * no external job queue (no Redis/SQS); a detached async function is this
 * app's stand-in for "background job" given its scale, and works because
 * it runs as a long-lived Node process (next start/dev), not a serverless
 * function that could be frozen once the response is sent. See CLAUDE.md.
 */
export async function runExportJob(
  jobId: string,
  userId: string,
): Promise<void> {
  const job = await getOwnedExportJob(jobId, userId);
  if (!job) return;

  try {
    await updateExportJobStatus(jobId, { status: "processing" });

    const data = await getExportData(userId, job.fromDate, job.toDate);
    let buffer: Buffer;
    let contentType: string;

    if (job.format === "csv") {
      buffer = buildCsvBuffer(
        data.entries,
        data.summariesByDate,
        data.fallbackTarget,
      );
      contentType = "text/csv; charset=utf-8";
    } else {
      const user = await getUserById(userId);
      const dayGroups = buildExportDayGroups(
        data.entries,
        data.summariesByDate,
        data.fallbackTarget,
      );
      buffer = await generateExportPdf({
        userEmail: user?.email ?? "",
        fromDate: job.fromDate,
        toDate: job.toDate,
        timezone: data.timezone,
        generatedAt: new Date(),
        dayGroups,
      });
      contentType = "application/pdf";
    }

    const key = buildExportKey(userId, jobId, job.format as "csv" | "pdf");
    await putObjectBuffer(key, buffer, contentType);
    await updateExportJobStatus(jobId, {
      status: "ready",
      storageKey: key,
      completedAt: new Date(),
    });
  } catch (err) {
    await updateExportJobStatus(jobId, {
      status: "failed",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }
}

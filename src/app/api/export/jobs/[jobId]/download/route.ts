import { NextResponse } from "next/server";
import { getEffectiveUser } from "@/server/dev-bypass";
import { getOwnedExportJob } from "@/server/repositories/export-jobs";
import { createPresignedExportDownloadUrl } from "@/server/storage/presign";

// getOwnedExportJob scopes the lookup to (jobId, userId) — user A can never
// redirect to user B's generated file this way, even by guessing a jobId.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const effectiveUser = await getEffectiveUser();
  if (!effectiveUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await params;
  const job = await getOwnedExportJob(jobId, effectiveUser.id);
  if (!job || job.status !== "ready" || !job.storageKey) {
    return NextResponse.json({ error: "Not ready" }, { status: 404 });
  }

  const filename = `snapcalorie_export_${job.fromDate.replaceAll("-", "")}_${job.toDate.replaceAll("-", "")}.${job.format}`;
  const contentType =
    job.format === "csv" ? "text/csv; charset=utf-8" : "application/pdf";
  const url = await createPresignedExportDownloadUrl(
    job.storageKey,
    filename,
    contentType,
  );
  return NextResponse.redirect(url);
}

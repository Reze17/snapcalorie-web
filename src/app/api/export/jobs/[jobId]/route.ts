import { NextResponse } from "next/server";
import { getEffectiveUser } from "@/server/dev-bypass";
import { getOwnedExportJob } from "@/server/repositories/export-jobs";

// getOwnedExportJob scopes the lookup to (jobId, userId) in one query — see
// its doc comment in export-jobs.ts. A jobId belonging to another user
// returns undefined here exactly as if it didn't exist, so this route
// cannot leak another user's export status.
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
  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    jobId: job.jobId,
    format: job.format,
    fromDate: job.fromDate,
    toDate: job.toDate,
    status: job.status,
    errorMessage: job.errorMessage,
  });
}

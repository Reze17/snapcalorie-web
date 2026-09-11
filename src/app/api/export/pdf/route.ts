import { NextResponse, type NextRequest } from "next/server";
import { buildExportDayGroups } from "@/lib/export";
import { generateExportPdf } from "@/server/export/pdf";
import { runExportJob } from "@/server/export/job-runner";
import { resolveExportRange, shouldExportAsync } from "@/server/export/range";
import { getEffectiveUser } from "@/server/dev-bypass";
import { createExportJob } from "@/server/repositories/export-jobs";
import { getExportData } from "@/server/repositories/export";
import { instantToLocalDate } from "@/server/lib/timezone";
import { getUserById } from "@/server/repositories/users";

// On a serverless host every range is generated inline (see
// shouldExportAsync) — give a long "all time" export room to finish.
export const maxDuration = 60;

// The user is derived from the session/dev-bypass only — never from a
// client-supplied id — and getExportData is scoped to exactly that user.
export async function GET(req: NextRequest) {
  const effectiveUser = await getEffectiveUser();
  if (!effectiveUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getUserById(effectiveUser.id);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const todayLocal = instantToLocalDate(new Date(), user.timezone);
  const { fromDate, toDate } = await resolveExportRange(
    user.id,
    user.timezone,
    todayLocal,
    searchParams,
  );

  if (shouldExportAsync(fromDate, toDate)) {
    const job = await createExportJob({
      userId: user.id,
      format: "pdf",
      fromDate,
      toDate,
    });
    void runExportJob(job.jobId, user.id);

    const redirectUrl = new URL("/export", req.url);
    redirectUrl.searchParams.set("pending", job.jobId);
    return NextResponse.redirect(redirectUrl, { status: 302 });
  }

  const data = await getExportData(user.id, fromDate, toDate);
  const dayGroups = buildExportDayGroups(
    data.entries,
    data.summariesByDate,
    data.fallbackTarget,
  );
  const buffer = await generateExportPdf({
    userEmail: user.email,
    fromDate,
    toDate,
    timezone: user.timezone,
    generatedAt: new Date(),
    dayGroups,
  });

  const filename = `snapcalorie_export_${fromDate.replaceAll("-", "")}_${toDate.replaceAll("-", "")}.pdf`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

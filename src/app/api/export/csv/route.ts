import { NextResponse, type NextRequest } from "next/server";
import {
  CSV_HEADERS,
  buildExportRows,
  csvRowLine,
  exportRowToCsvFields,
} from "@/lib/export";
import { runExportJob } from "@/server/export/job-runner";
import {
  ASYNC_JOB_THRESHOLD_DAYS,
  daysBetweenInclusive,
  resolveExportRange,
} from "@/server/export/range";
import { getEffectiveUser } from "@/server/dev-bypass";
import { createExportJob } from "@/server/repositories/export-jobs";
import { getExportData } from "@/server/repositories/export";
import { instantToLocalDate } from "@/server/lib/timezone";
import { getUserById } from "@/server/repositories/users";

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

  if (daysBetweenInclusive(fromDate, toDate) > ASYNC_JOB_THRESHOLD_DAYS) {
    const job = await createExportJob({
      userId: user.id,
      format: "csv",
      fromDate,
      toDate,
    });
    void runExportJob(job.jobId, user.id);

    const redirectUrl = new URL("/export", req.url);
    redirectUrl.searchParams.set("pending", job.jobId);
    return NextResponse.redirect(redirectUrl, { status: 302 });
  }

  const data = await getExportData(user.id, fromDate, toDate);
  const rows = buildExportRows(
    data.entries,
    data.summariesByDate,
    data.fallbackTarget,
  );

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode("\uFEFF"));
      controller.enqueue(encoder.encode(CSV_HEADERS.join(",") + "\r\n"));
      for (const row of rows) {
        controller.enqueue(
          encoder.encode(csvRowLine(exportRowToCsvFields(row))),
        );
      }
      controller.close();
    },
  });

  const filename = `snapcalorie_export_${fromDate.replaceAll("-", "")}_${toDate.replaceAll("-", "")}.csv`;
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

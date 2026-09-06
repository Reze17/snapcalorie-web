"use client";

import { useEffect, useState } from "react";

interface JobStatusResponse {
  status: "pending" | "processing" | "ready" | "failed";
  format: "csv" | "pdf";
  errorMessage?: string | null;
}

const POLL_INTERVAL_MS = 2000;

export function ExportJobStatus({ jobId }: { jobId: string }) {
  const [state, setState] = useState<JobStatusResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const res = await fetch(`/api/export/jobs/${jobId}`);
        if (!res.ok) throw new Error("status check failed");
        const data: JobStatusResponse = await res.json();
        if (cancelled) return;
        setState(data);
        if (data.status === "pending" || data.status === "processing") {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch {
        if (!cancelled) timer = setTimeout(poll, POLL_INTERVAL_MS * 2);
      }
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [jobId]);

  if (!state || state.status === "pending" || state.status === "processing") {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-white/10 p-4">
        <p className="text-sm">
          Preparing your export — this can take a little longer for a long
          history. You can leave this page and come back later.
        </p>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/3 animate-pulse bg-white/40" />
        </div>
      </div>
    );
  }

  if (state.status === "failed") {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-white/10 p-4">
        <p className="text-sm">
          Something went wrong generating your export. Nothing was lost — you
          can try again.
        </p>
        <a href="/export" className="text-sm underline">
          Back to export
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-white/10 p-4">
      <p className="text-sm">Your export is ready.</p>
      <a
        href={`/api/export/jobs/${jobId}/download`}
        className="w-full rounded bg-white/10 px-4 py-3 text-center text-sm font-medium hover:bg-white/20"
      >
        Download {state.format.toUpperCase()}
      </a>
    </div>
  );
}

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getEffectiveUser } from "@/server/dev-bypass";
import { AnalysisView } from "./AnalysisView";
import { runAnalysis } from "./actions";

// Split out so the page shell (heading, nav) can stream to the client
// immediately via the Suspense boundary below, instead of the whole page
// blocking on the vision call — a real (not decorative) use of Next's RSC
// streaming, per the Phase 10 latency pass.
async function AnalysisResult({ objectKey }: { objectKey: string }) {
  const outcome = await runAnalysis(objectKey);
  return <AnalysisView objectKey={objectKey} initialOutcome={outcome} />;
}

function AnalysisSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <div className="h-40 w-full animate-pulse rounded-lg bg-white/10" />
      <div className="h-4 w-2/3 animate-pulse rounded bg-white/10" />
      <div className="h-4 w-1/2 animate-pulse rounded bg-white/10" />
      <p className="text-sm text-[var(--foreground)]/60">
        Analyzing your photo…
      </p>
    </div>
  );
}

export default async function AnalyzePage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const user = await getEffectiveUser();
  if (!user) {
    redirect("/login");
  }

  const { key } = await searchParams;
  if (!key) {
    return (
      <main className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Analyze a meal</h1>
        <p className="text-sm text-[var(--foreground)]/70">
          No photo was provided.
        </p>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Meal analysis</h1>
      <Suspense fallback={<AnalysisSkeleton />}>
        <AnalysisResult objectKey={key} />
      </Suspense>
    </main>
  );
}

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getEffectiveUser } from "@/server/dev-bypass";
import { AnalysisView } from "./AnalysisView";
import { getTodayBudget, runAnalysis } from "./actions";

// Split out so the page shell (heading, nav) can stream to the client
// immediately via the Suspense boundary below, instead of the whole page
// blocking on the vision call — a real (not decorative) use of Next's RSC
// streaming, per the Phase 10 latency pass.
async function AnalysisResult({ objectKey }: { objectKey: string }) {
  const [outcome, budget] = await Promise.all([
    runAnalysis(objectKey),
    getTodayBudget(),
  ]);
  return (
    <AnalysisView
      objectKey={objectKey}
      initialOutcome={outcome}
      consumedToday={budget.consumedToday}
      dailyTarget={budget.dailyTarget}
    />
  );
}

function AnalysisSkeleton() {
  return (
    <div className="flex flex-col items-center gap-3 py-10" aria-busy="true">
      <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-border border-t-accent" />
      <p className="text-sm font-semibold text-text-muted">
        Analyzing your meal…
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
      <div className="flex flex-col gap-2">
        <h1 className="text-lg font-bold">Analyze a meal</h1>
        <p className="text-sm text-text-muted">No photo was provided.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-bold">Meal analysis</h1>
      <Suspense fallback={<AnalysisSkeleton />}>
        <AnalysisResult objectKey={key} />
      </Suspense>
    </div>
  );
}

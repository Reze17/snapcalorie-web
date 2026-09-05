import { redirect } from "next/navigation";
import { getEffectiveUser } from "@/server/dev-bypass";
import { AnalysisView } from "./AnalysisView";
import { runAnalysis } from "./actions";

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

  const outcome = await runAnalysis(key);

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Meal analysis</h1>
      <AnalysisView objectKey={key} initialOutcome={outcome} />
    </main>
  );
}

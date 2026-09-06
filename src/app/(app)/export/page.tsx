import { redirect } from "next/navigation";
import { ExportJobStatus } from "./ExportJobStatus";
import { getEffectiveUser } from "@/server/dev-bypass";
import { instantToLocalDate } from "@/server/lib/timezone";
import { getEarliestEntryLocalDate } from "@/server/repositories/export";
import { getUserById } from "@/server/repositories/users";

export default async function ExportPage({
  searchParams,
}: {
  searchParams: Promise<{ pending?: string }>;
}) {
  const effectiveUser = await getEffectiveUser();
  if (!effectiveUser) {
    redirect("/login");
  }

  const user = await getUserById(effectiveUser.id);
  if (!user) {
    redirect("/login");
  }

  const todayLocal = instantToLocalDate(new Date(), user.timezone);
  const earliest = await getEarliestEntryLocalDate(user.id);
  const { pending } = await searchParams;

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">Export your data</h1>
      <p className="text-sm text-[var(--foreground)]/70">
        Download your meal history as a CSV spreadsheet or a PDF report.
        {earliest
          ? ` Your history starts on ${earliest}.`
          : " You haven't logged any meals yet — an export will be empty."}
      </p>

      {pending ? (
        <ExportJobStatus jobId={pending} />
      ) : (
        <form
          className="flex flex-col gap-4 rounded-lg border border-white/10 p-4"
          method="get"
          action="/api/export/csv"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="from" className="text-sm">
              From
            </label>
            <input
              id="from"
              name="from"
              type="date"
              max={todayLocal}
              placeholder="All time"
              className="h-11 rounded border border-white/20 bg-transparent px-3 text-sm"
            />
            <span className="text-xs text-[var(--foreground)]/60">
              Leave blank for your complete history.
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="to" className="text-sm">
              To
            </label>
            <input
              id="to"
              name="to"
              type="date"
              defaultValue={todayLocal}
              max={todayLocal}
              className="h-11 rounded border border-white/20 bg-transparent px-3 text-sm"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              formAction="/api/export/csv"
              className="flex-1 rounded bg-white/10 px-4 py-3 text-center text-sm font-medium hover:bg-white/20"
            >
              Download CSV
            </button>
            <button
              type="submit"
              formAction="/api/export/pdf"
              className="flex-1 rounded bg-white/10 px-4 py-3 text-center text-sm font-medium hover:bg-white/20"
            >
              Download PDF
            </button>
          </div>
          <p className="text-xs text-[var(--foreground)]/60">
            A large date range (over 90 days) generates in the background —
            you&apos;ll see a progress state here and can download once
            it&apos;s ready.
          </p>
        </form>
      )}
    </main>
  );
}

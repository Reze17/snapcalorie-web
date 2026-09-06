import { notFound } from "next/navigation";
import { getEffectiveUser } from "@/server/dev-bypass";
import {
  getLatencyStats,
  getMealEditRate,
  getStreakDistribution,
  type StreakBucket,
} from "@/server/repositories/metrics";

// Not found (not a login redirect) for anyone who isn't on the allowlist —
// deliberately doesn't confirm this route exists to a non-admin. There's
// no role column on `users` (adding one is more schema churn than an
// internal metrics page needs), so this is an env-var allowlist instead,
// following the same getEffectiveUser() convention every other protected
// page in this app already uses.
function isAdminEmail(email: string): boolean {
  const allowlist = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(email.toLowerCase());
}

const STREAK_BUCKET_ORDER: StreakBucket[] = ["0", "1-2", "3-6", "7-13", "14+"];

export default async function AdminMetricsPage() {
  const user = await getEffectiveUser();
  if (!user || !isAdminEmail(user.email)) {
    notFound();
  }

  const [latencyStats, editRate, streaks] = await Promise.all([
    getLatencyStats(24),
    getMealEditRate(),
    getStreakDistribution(),
  ]);

  return (
    <main className="mx-auto flex max-w-screen-md flex-col gap-8 px-4 py-8">
      <h1 className="text-xl font-semibold">Internal metrics</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-[var(--foreground)]/70">
          Latency by stage (last 24h) — FRD §6 target: ≤4.0s end-to-end
        </h2>
        {latencyStats.length === 0 ? (
          <p className="text-sm text-[var(--foreground)]/60">
            No latency events recorded yet in this window.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[var(--foreground)]/60">
                  <th className="py-1 pr-4">Stage</th>
                  <th className="py-1 pr-4">Count</th>
                  <th className="py-1 pr-4">p50</th>
                  <th className="py-1 pr-4">p75</th>
                  <th className="py-1">p95</th>
                </tr>
              </thead>
              <tbody>
                {latencyStats.map((stat) => (
                  <tr key={stat.event} className="border-b border-white/5">
                    <td className="py-1 pr-4">{stat.event}</td>
                    <td className="py-1 pr-4">{stat.count}</td>
                    <td className="py-1 pr-4">{stat.p50}ms</td>
                    <td className="py-1 pr-4">{stat.p75}ms</td>
                    <td className="py-1">{stat.p95}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-[var(--foreground)]/70">
          Meals saved with zero manual edits — FRD §7 target: &gt;75%
        </h2>
        <p className="text-2xl font-semibold">
          {editRate.cleanPercentage}%
          <span className="ml-2 text-sm font-normal text-[var(--foreground)]/60">
            ({editRate.cleanMeals} / {editRate.totalMeals} meals)
          </span>
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-[var(--foreground)]/70">
          Current-streak distribution ({streaks.totalUsers} users)
        </h2>
        <div className="flex flex-col gap-1">
          {STREAK_BUCKET_ORDER.map((bucket) => (
            <div key={bucket} className="flex items-center gap-3 text-sm">
              <span className="w-16 shrink-0 text-[var(--foreground)]/60">
                {bucket} days
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-white/50"
                  style={{
                    width: `${streaks.totalUsers === 0 ? 0 : (streaks.buckets[bucket] / streaks.totalUsers) * 100}%`,
                  }}
                />
              </div>
              <span className="w-8 shrink-0 text-right">
                {streaks.buckets[bucket]}
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

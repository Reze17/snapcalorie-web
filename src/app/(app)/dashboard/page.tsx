import Link from "next/link";
import { auth } from "@/auth";

export default async function DashboardPage() {
  const session = await auth();

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <p className="text-sm text-[var(--foreground)]/70">
        Signed in as {session?.user?.email}. The daily log and progress view
        land in Phase 7.
      </p>
      <Link
        href="/capture"
        className="w-full rounded bg-white/10 px-4 py-3 text-center text-sm font-medium hover:bg-white/20"
      >
        Log a meal
      </Link>
    </main>
  );
}

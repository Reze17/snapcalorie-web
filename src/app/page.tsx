import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-screen-sm flex-col items-center justify-center gap-4 px-4 py-8 text-center">
      <h1 className="text-2xl font-semibold">SnapCalorie Web</h1>
      <p className="text-sm text-[var(--foreground)]/70">
        An AI meal-photo calorie tracker.
      </p>
      <div className="flex gap-3">
        <Link
          href="/login"
          className="rounded border border-white/20 px-4 py-2 text-sm hover:bg-white/10"
        >
          Log in
        </Link>
        <Link
          href="/signup"
          className="rounded bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
        >
          Sign up
        </Link>
      </div>
    </main>
  );
}

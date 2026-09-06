import { redirect } from "next/navigation";
import Link from "next/link";
import { signOut } from "@/auth";
import { getEffectiveUser, isDevBypassEnabled } from "@/server/dev-bypass";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getEffectiveUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-screen-sm flex-col px-4 py-6">
      {isDevBypassEnabled() && (
        <div className="mb-4 rounded border border-white/20 bg-white/5 px-3 py-2 text-xs text-[var(--foreground)]/70">
          DEV_BYPASS_AUTH is on — signed in as {user.email} without a real
          session. Turn it off in .env when you add real login testing back.
        </div>
      )}
      <header className="mb-6 flex items-center gap-3">
        {/* Scrolls internally rather than wrapping at 360px — a page-level
            wrap would push "Sign out" onto its own row and break the
            single-row header; this keeps the header one row at every
            width, per the Phase 10 responsive audit. */}
        <nav className="flex min-w-0 flex-1 gap-4 overflow-x-auto text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {/* py-1.5 bumps each link's tap target to >=24px tall (WCAG 2.5.8
              / Lighthouse's target-size audit) without changing the visible
              text size or the header's overall height thanks to -my-1.5
              compensating. */}
          <Link className="shrink-0 -my-1.5 py-1.5" href="/dashboard">
            Dashboard
          </Link>
          <Link className="shrink-0 -my-1.5 py-1.5" href="/capture">
            Log meal
          </Link>
          <Link className="shrink-0 -my-1.5 py-1.5" href="/insights">
            Insights
          </Link>
          <Link className="shrink-0 -my-1.5 py-1.5" href="/export">
            Export
          </Link>
          <Link className="shrink-0 -my-1.5 py-1.5" href="/profile">
            Profile
          </Link>
        </nav>
        <form
          className="shrink-0"
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button
            type="submit"
            className="-my-1.5 py-1.5 text-sm text-[var(--foreground)]/60 hover:underline"
          >
            Sign out
          </button>
        </form>
      </header>
      {children}
    </div>
  );
}

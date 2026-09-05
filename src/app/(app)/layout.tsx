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
      <header className="mb-6 flex items-center justify-between">
        <nav className="flex gap-4 text-sm">
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/capture">Log meal</Link>
          <Link href="/profile">Profile</Link>
        </nav>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button
            type="submit"
            className="text-sm text-[var(--foreground)]/60 hover:underline"
          >
            Sign out
          </button>
        </form>
      </header>
      {children}
    </div>
  );
}

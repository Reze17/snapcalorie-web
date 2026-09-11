import { redirect } from "next/navigation";
import { getEffectiveUser, isDevBypassEnabled } from "@/server/dev-bypass";
import { BottomNav } from "./BottomNav";

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
    <div className="flex min-h-screen w-full flex-col bg-bg">
      {isDevBypassEnabled() && (
        <div className="mx-auto w-full max-w-screen-sm px-4 pt-3">
          <div className="rounded-xl border border-border bg-surface px-3 py-2 text-xs text-text-muted">
            DEV_BYPASS_AUTH is on — signed in as {user.email} without a real
            session. Turn it off in .env when you add real login testing back.
          </div>
        </div>
      )}
      <main className="mx-auto w-full max-w-screen-sm flex-1 px-4 pt-6 pb-28">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}

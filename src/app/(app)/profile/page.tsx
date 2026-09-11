import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { getUserById } from "@/server/repositories/users";
import { getEffectiveUser } from "@/server/dev-bypass";
import { ProfileForm } from "./ProfileForm";

export default async function ProfilePage() {
  const effectiveUser = await getEffectiveUser();
  if (!effectiveUser) {
    redirect("/login");
  }

  const user = await getUserById(effectiveUser.id);
  if (!user) {
    redirect("/login");
  }

  const initial = (user.email || "?").charAt(0).toUpperCase();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-1 pt-2">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft font-display text-lg font-bold text-accent-strong">
          {initial}
        </div>
        <p className="mt-1 text-sm font-semibold text-text">{user.email}</p>
      </div>

      <Link
        href={user.onboardingCompletedAt ? "/goal" : "/onboarding"}
        className="flex items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3.5"
      >
        <div>
          <p className="text-sm font-semibold">Your goal</p>
          <p className="text-xs text-text-muted">
            {user.onboardingCompletedAt
              ? `${user.goalType === "lose" ? "Losing weight" : user.goalType === "gain" ? "Gaining weight" : "Maintaining weight"} · ${user.dailyCalorieTarget.toLocaleString()} kcal/day`
              : "Set up a personalized calorie target"}
          </p>
        </div>
        <span className="text-text-muted">›</span>
      </Link>

      <ProfileForm
        dailyCalorieTarget={user.dailyCalorieTarget}
        timezone={user.timezone}
      />

      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <Link
          href="/export"
          className="flex items-center justify-between border-b border-border px-4 py-3.5 text-sm"
        >
          <span className="font-semibold">Export your data</span>
          <span className="text-text-muted">›</span>
        </Link>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button
            type="submit"
            className="flex w-full items-center justify-between px-4 py-3.5 text-left text-sm font-semibold text-text-muted"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}

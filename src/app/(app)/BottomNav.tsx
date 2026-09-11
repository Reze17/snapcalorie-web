"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  {
    href: "/dashboard",
    label: "Today",
    match: ["/dashboard", "/entries"],
    icon: (
      <path
        d="M4 12l8-8 8 8M6 10v10h12V10"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    href: "/insights",
    label: "Progress",
    match: ["/insights"],
    icon: (
      <path
        d="M4 19V9M12 19V4M20 19v-7"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    href: "/profile",
    label: "Profile",
    match: ["/profile", "/export", "/goal"],
    icon: (
      <>
        <circle
          cx="12"
          cy="8"
          r="3.4"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        />
        <path
          d="M4.5 20c1.5-4 5-5.5 7.5-5.5S18 16 19.5 20"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
        />
      </>
    ),
  },
] as const;

/**
 * The core loop's single most important control is scanning a meal, so
 * it gets its own elevated, center-docked action rather than competing
 * as a fourth equal-weight tab — see the redesign's UX audit.
 */
export function BottomNav() {
  const pathname = usePathname();
  const isActive = (matchers: readonly string[]) =>
    matchers.some((m) => pathname === m || pathname.startsWith(m + "/"));

  const [today, progress, profile] = TABS;

  return (
    <nav
      className="sticky bottom-0 z-20 border-t border-border bg-surface"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex w-full max-w-screen-sm items-center justify-around px-2">
        <NavItem tab={today} active={isActive(today.match)} />
        <Link
          href="/capture"
          aria-label="Scan meal"
          className="-mt-7 flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-4 border-bg bg-accent text-accent-ink shadow-[0_10px_22px_-6px_var(--accent)]"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
            <rect
              x="3"
              y="7"
              width="18"
              height="13"
              rx="3"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            />
            <path
              d="M8 7l1.5-3h5L16 7"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            />
            <circle
              cx="12"
              cy="13.5"
              r="3.4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            />
          </svg>
        </Link>
        <NavItem tab={progress} active={isActive(progress.match)} />
        <NavItem tab={profile} active={isActive(profile.match)} />
      </div>
    </nav>
  );
}

function NavItem({
  tab,
  active,
}: {
  tab: (typeof TABS)[number];
  active: boolean;
}) {
  return (
    <Link
      href={tab.href}
      className={`flex min-w-[52px] flex-col items-center gap-1 py-2.5 text-[10.5px] font-semibold ${
        active ? "text-accent" : "text-text-faint"
      }`}
      aria-current={active ? "page" : undefined}
    >
      <svg viewBox="0 0 24 24" className="h-[19px] w-[19px]" aria-hidden="true">
        {tab.icon}
      </svg>
      {tab.label}
    </Link>
  );
}

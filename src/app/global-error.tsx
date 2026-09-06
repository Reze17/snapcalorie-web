"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// Next's App Router convention: this replaces the ENTIRE root layout
// (html/body included) when a rendering error escapes every other error
// boundary, so it needs its own <html>/<body>. Reports to Sentry (a
// no-op without SENTRY_DSN/NEXT_PUBLIC_SENTRY_DSN set) without exposing
// error.message to the page — same "no internal detail to the client"
// rule as the server actions' catch blocks.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
          <h1 className="text-lg font-semibold">Something went wrong.</h1>
          <p className="text-sm text-[var(--foreground)]/70">
            We&apos;ve been notified. Try refreshing the page.
          </p>
        </main>
      </body>
    </html>
  );
}

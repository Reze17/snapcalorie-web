import * as Sentry from "@sentry/nextjs";

// No-ops cleanly with an empty dsn — Sentry.init() is safe to call even
// when SENTRY_DSN is unset, so no account is needed for this file to be
// correct; it just won't report anything until a real DSN is added.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  // Scrub the one thing that must never leave this process even in an
  // error report: a storage key (meal photo / export file path) embedded
  // in a request URL's query string (?key=..., /jobs/{jobId}/download,
  // etc.) or in the error message text itself. See CLAUDE.md's Phase 10
  // privacy note.
  beforeSend(event) {
    if (event.request?.url) {
      try {
        const url = new URL(event.request.url);
        url.searchParams.delete("key");
        event.request.url = url.toString();
      } catch {
        // not a parseable absolute URL — leave it alone
      }
    }
    return event;
  },
});

import * as Sentry from "@sentry/nextjs";

// NEXT_PUBLIC_ prefix required for this to reach the browser bundle at
// all — the server-only SENTRY_DSN never does, which is deliberate (kept
// separate rather than reusing one var, so a deployment can report
// server errors without also shipping a DSN to every client, or vice
// versa). No-ops without a DSN, same as the server/edge configs.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
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

// Required by the SDK to instrument App Router client-side navigations.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

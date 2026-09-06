import * as Sentry from "@sentry/nextjs";

// Next's own instrumentation hook — this is what actually loads the
// server/edge Sentry config files; withSentryConfig (next.config.ts)
// handles build-time source-map upload, not runtime init.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;

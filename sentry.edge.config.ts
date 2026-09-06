import * as Sentry from "@sentry/nextjs";

// Middleware runs on the Edge runtime — separate init file per Sentry's
// own Next.js integration convention. Same no-op-without-a-DSN behavior
// as sentry.server.config.ts.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
});

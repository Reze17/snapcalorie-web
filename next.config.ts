import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

// Static security headers (FRD §6). CSP is dynamic (needs a per-request
// nonce) and lives in src/middleware.ts instead — these are the ones that
// don't need per-request computation.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=()",
  },
  // Only meaningful over HTTPS — harmless to send in dev, but only ever
  // actually enforced by browsers once the app is served over TLS.
  ...(process.env.NODE_ENV === "production"
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  // Self-contained output (pruned node_modules + a minimal server.js) —
  // what the Dockerfile's runtime stage copies. Doesn't change `next
  // start`/local dev at all, just adds this alongside the normal build.
  output: "standalone",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

// withSentryConfig is safe to apply even with no SENTRY_DSN/auth token set
// (see sentry.*.config.ts) — it just skips the source-map-upload step at
// build time with a warning rather than failing, so this never blocks a
// build that hasn't set up a Sentry project.
export default withSentryConfig(nextConfig, {
  silent: true,
  webpack: {
    treeshake: { removeDebugLogging: true },
  },
});

import { defineConfig, devices } from "@playwright/test";

// A production build, not `next dev`, is what makes the 4G latency number
// meaningful: dev mode lazily compiles each route on first request (which
// can itself take several seconds) and ships unminified bundles, so
// measuring against it conflates "Next dev-server overhead" with real
// user-facing latency. Always builds fresh (reuseExistingServer: false) so
// the number reflects the current code, not a stale server left running.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "perf-4g.spec.ts",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      VISION_PROVIDER: "mock",
      DEV_BYPASS_AUTH: "false",
      // Auth.js v5 validates the Host header strictly once NODE_ENV=production
      // (it's lenient in dev) — this local perf run has no reverse proxy
      // setting a trusted host, so it needs the explicit opt-in. A real
      // deployment behind a real domain should set this deliberately too,
      // per Auth.js's own docs on AUTH_TRUST_HOST.
      AUTH_TRUST_HOST: "true",
    },
  },
});

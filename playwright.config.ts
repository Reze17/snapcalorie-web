import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // perf-4g.spec.ts needs a production build to give a meaningful number
  // (see its own comments) — it has its own config/script (npm run
  // test:perf, playwright.perf.config.ts) and would just time out here
  // against the dev server's on-demand compilation + no minification.
  testIgnore: "perf-4g.spec.ts",
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
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Force the deterministic mock vision provider for e2e runs, regardless
    // of what a developer has set in .env for manual live-provider testing.
    // Only takes effect when Playwright starts its own server — if an
    // existing dev server is reused, stop it first so this applies.
    env: { VISION_PROVIDER: "mock", DEV_BYPASS_AUTH: "false" },
  },
});

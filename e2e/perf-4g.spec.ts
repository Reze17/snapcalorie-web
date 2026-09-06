import path from "node:path";
import "dotenv/config";
import { eq } from "drizzle-orm";
import { expect, test } from "@playwright/test";
import { db } from "../src/db/client";
import { users } from "../src/db/schema";

const FIXTURE_PATH = path.join(__dirname, "fixtures", "sample-meal.jpg");

// Chrome DevTools' own "Fast 4G" preset figures (Mbps -> bytes/sec).
const FAST_4G = {
  offline: false,
  downloadThroughput: (4 * 1024 * 1024) / 8,
  uploadThroughput: (3 * 1024 * 1024) / 8,
  latency: 150,
};

const RUNS = 5;
const P75_BUDGET_MS = 4000;

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(Math.max(rank - 1, 0), sorted.length - 1)];
}

// FRD §6: p75 capture->result latency <= 4.0s on simulated 4G, measured
// against the real capture/upload/analyze flow (mock vision provider, so
// this measures this app's own overhead — network + upload + normalize +
// render — not Anthropic's live inference latency, which is a separate,
// unbounded external dependency this test can't and shouldn't gate on).
test("capture->analyze result stays within the 4.0s p75 budget on simulated 4G", async ({
  page,
  context,
}) => {
  const email = `pw-perf-${Date.now()}@snapcalorie.dev`;
  const password = "playwright-test-password";

  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const client = await context.newCDPSession(page);
  await client.send("Network.enable");
  await client.send("Network.emulateNetworkConditions", FAST_4G);

  const durations: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const start = Date.now();

    await page.goto("/capture");
    await page.locator('input[type="file"]').nth(1).setInputFiles(FIXTURE_PATH);
    const useThisPhoto = page.getByRole("button", { name: "Use this photo" });
    await expect(useThisPhoto).toBeVisible();
    await useThisPhoto.click();
    await expect(page).toHaveURL(/\/analyze\?key=/, { timeout: 30_000 });
    // The actual "result" moment: at least one detected item card rendered
    // (not just the page shell/skeleton from the Suspense boundary).
    await expect(page.locator('[data-testid="item-card"]').first()).toBeVisible(
      { timeout: 30_000 },
    );

    durations.push(Date.now() - start);
  }

  const p75 = percentile(durations, 75);
  console.log(
    `capture->analyze durations (ms) under simulated Fast 4G: ${JSON.stringify(durations)}, p75=${p75}`,
  );

  await db.delete(users).where(eq(users.email, email));

  expect(p75).toBeLessThanOrEqual(P75_BUDGET_MS);
});

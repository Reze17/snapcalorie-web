import os from "node:os";
import path from "node:path";
import "dotenv/config";
import { eq } from "drizzle-orm";
import { expect, test } from "@playwright/test";
import { db } from "../src/db/client";
import { users } from "../src/db/schema";

// FRD §6 responsive audit: no horizontal scroll, no clipped controls, no
// unreadable chart labels at any of these four widths. 3840 (4K) is
// deliberately NOT expected to use the full width — this app's layout is
// mobile-first with a centered max-width container, so a 4K viewport
// should just show more surrounding whitespace, not a stretched layout.
const VIEWPORTS = [
  { name: "360w (mobile)", width: 360, height: 800 },
  { name: "768w (tablet)", width: 768, height: 900 },
  { name: "1440w (desktop)", width: 1440, height: 900 },
  { name: "3840w (4K)", width: 3840, height: 2160 },
];

const STORAGE_STATE_PATH = path.join(
  os.tmpdir(),
  `snapcalorie-responsive-auth-${Date.now()}.json`,
);

async function assertNoHorizontalScroll(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    overflow.scrollWidth,
    `scrollWidth (${overflow.scrollWidth}) should not exceed clientWidth (${overflow.clientWidth})`,
  ).toBeLessThanOrEqual(overflow.clientWidth);
}

test.describe("responsive audit (360 / 768 / 1440 / 3840px)", () => {
  const email = `pw-responsive-${Date.now()}@snapcalorie.dev`;
  const password = "playwright-test-password";

  // Playwright gives every individual test() its own isolated browser
  // context by default — a session created here is not visible to a test's
  // auto-injected `page` fixture. Each test below explicitly opens its own
  // context from this saved storageState instead of relying on the
  // `page` fixture, which sidesteps that isolation cleanly.
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/signup");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await context.storageState({ path: STORAGE_STATE_PATH });
    await context.close();
  });

  test.afterAll(async () => {
    await db.delete(users).where(eq(users.email, email));
  });

  for (const viewport of VIEWPORTS) {
    test(`dashboard has no horizontal scroll at ${viewport.name}`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        storageState: STORAGE_STATE_PATH,
        viewport,
      });
      const page = await context.newPage();
      await page.goto("/dashboard");
      await assertNoHorizontalScroll(page);
      // The bottom nav must stay reachable (not clipped) at every width —
      // see src/app/(app)/BottomNav.tsx.
      await expect(page.getByRole("link", { name: "Progress" })).toBeVisible();
      await context.close();
    });

    test(`insights (chart-heavy) has no horizontal scroll at ${viewport.name}`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        storageState: STORAGE_STATE_PATH,
        viewport,
      });
      const page = await context.newPage();
      await page.goto("/insights");
      await assertNoHorizontalScroll(page);
      await expect(page.getByText("Current streak")).toBeVisible();
      await context.close();
    });

    test(`export page has no horizontal scroll at ${viewport.name}`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        storageState: STORAGE_STATE_PATH,
        viewport,
      });
      const page = await context.newPage();
      await page.goto("/export");
      await assertNoHorizontalScroll(page);
      await expect(
        page.getByRole("button", { name: "Download CSV" }),
      ).toBeVisible();
      await context.close();
    });
  }
});

import path from "node:path";
import "dotenv/config";
import { eq } from "drizzle-orm";
import { expect, test } from "@playwright/test";
import { db } from "../src/db/client";
import { users } from "../src/db/schema";

const FIXTURE_PATH = path.join(__dirname, "fixtures", "sample-meal.jpg");

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

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto("/signup");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/capture");
    await page.locator('input[type="file"]').nth(1).setInputFiles(FIXTURE_PATH);
    const useThisPhoto = page.getByRole("button", { name: "Use this photo" });
    await expect(useThisPhoto).toBeVisible();
    await useThisPhoto.click();
    await expect(page).toHaveURL(/\/analyze\?key=/, { timeout: 15_000 });
    await page.getByRole("button", { name: "Save meal" }).click();
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
    await page.close();
  });

  test.afterAll(async () => {
    await db.delete(users).where(eq(users.email, email));
  });

  for (const viewport of VIEWPORTS) {
    test(`dashboard has no horizontal scroll at ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto("/dashboard");
      await assertNoHorizontalScroll(page);
      // The nav must stay reachable (not clipped) even in its scrollable
      // form at narrow widths — see src/app/(app)/layout.tsx.
      await expect(page.getByRole("link", { name: "Insights" })).toBeVisible();
    });

    test(`insights (chart-heavy) has no horizontal scroll at ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto("/insights");
      await assertNoHorizontalScroll(page);
      await expect(page.getByText("Current streak")).toBeVisible();
    });

    test(`export page has no horizontal scroll at ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto("/export");
      await assertNoHorizontalScroll(page);
      await expect(
        page.getByRole("button", { name: "Download CSV" }),
      ).toBeVisible();
    });
  }
});

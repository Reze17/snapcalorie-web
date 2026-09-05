import path from "node:path";
import "dotenv/config";
import { eq } from "drizzle-orm";
import { expect, test } from "@playwright/test";
import { db } from "../src/db/client";
import { users } from "../src/db/schema";

const FIXTURE_PATH = path.join(__dirname, "fixtures", "sample-meal.jpg");

async function logOneMockMeal(page: import("@playwright/test").Page) {
  await page.goto("/capture");
  await page.locator('input[type="file"]').nth(1).setInputFiles(FIXTURE_PATH);
  const useThisPhoto = page.getByRole("button", { name: "Use this photo" });
  await expect(useThisPhoto).toBeVisible();
  await useThisPhoto.click();
  await expect(page).toHaveURL(/\/analyze\?key=/, { timeout: 15_000 });
  await page.getByRole("button", { name: "Save meal" }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
}

test("over-target day shows neutral factual copy with no modal or danger styling", async ({
  page,
}) => {
  const email = `pw-dashboard-${Date.now()}@snapcalorie.dev`;
  const password = "playwright-test-password";

  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // Lowest allowed target (800) so two mock plates (~592 kcal each) push
  // the day comfortably over target without needing an out-of-range value.
  await page.goto("/profile");
  await page.locator('input[name="dailyCalorieTarget"]').fill("800");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await logOneMockMeal(page);
  await logOneMockMeal(page);

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText(/kcal over target/)).toBeVisible();

  // FR-08: no blocking modal, no red/danger styling, ever.
  await expect(
    page.locator('[role="dialog"], [role="alertdialog"], dialog'),
  ).toHaveCount(0);
  await expect(page.locator('[class*="red"], [class*="danger"]')).toHaveCount(
    0,
  );

  // Cleanup: cascades entries/items/summaries.
  await db.delete(users).where(eq(users.email, email));
});

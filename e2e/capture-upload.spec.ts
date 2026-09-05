import path from "node:path";
import { expect, test } from "@playwright/test";

const FIXTURE_PATH = path.join(__dirname, "fixtures", "sample-meal.jpg");

test("uploads a photo end to end against local object storage", async ({
  page,
}) => {
  const email = `pw-${Date.now()}@snapcalorie.dev`;
  const password = "playwright-test-password";

  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/capture");

  // Index 1 is the plain (no capture="environment") "Upload photo" input.
  const fileInput = page.locator('input[type="file"]').nth(1);
  await fileInput.setInputFiles(FIXTURE_PATH);

  const useThisPhoto = page.getByRole("button", { name: "Use this photo" });
  await expect(useThisPhoto).toBeVisible();
  await useThisPhoto.click();

  await expect(page).toHaveURL(/\/analyze\?key=/, { timeout: 15_000 });

  const key = new URL(page.url()).searchParams.get("key");
  expect(key).toMatch(/^users\/[0-9a-f-]+\/meals\/[0-9a-f-]+\.jpg$/);

  // The mock vision provider's deterministic 3-item plate, plus the sticky
  // totals/save bar, confirms analysis rendered on the review screen.
  await expect(page.getByText("Grilled chicken breast")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save meal" })).toBeVisible();
});

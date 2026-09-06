import fs from "node:fs/promises";
import path from "node:path";
import "dotenv/config";
import { eq } from "drizzle-orm";
import { expect, test } from "@playwright/test";
import { db } from "../src/db/client";
import { users } from "../src/db/schema";

const FIXTURE_PATH = path.join(__dirname, "fixtures", "sample-meal.jpg");

test("downloads a real CSV and PDF for the signed-in user's own meals", async ({
  page,
}) => {
  const email = `pw-export-${Date.now()}@snapcalorie.dev`;
  const password = "playwright-test-password";

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

  await page.goto("/export");

  const [csvDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download CSV" }).click(),
  ]);
  expect(csvDownload.suggestedFilename()).toMatch(
    /^snapcalorie_export_\d{8}_\d{8}\.csv$/,
  );
  const csvPath = await csvDownload.path();
  expect(csvPath).not.toBeNull();
  const csvContent = await fs.readFile(csvPath as string, "utf-8");
  expect(csvContent).toContain("date,logged_at,entry_id,item_name");
  // One header row + at least one item row from the meal just logged.
  expect(csvContent.trim().split("\r\n").length).toBeGreaterThanOrEqual(2);

  const [pdfDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download PDF" }).click(),
  ]);
  expect(pdfDownload.suggestedFilename()).toMatch(
    /^snapcalorie_export_\d{8}_\d{8}\.pdf$/,
  );
  const pdfPath = await pdfDownload.path();
  expect(pdfPath).not.toBeNull();
  const pdfBuffer = await fs.readFile(pdfPath as string);
  expect(pdfBuffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");

  // Cleanup: cascades entries/items/summaries/export_jobs.
  await db.delete(users).where(eq(users.email, email));
});

test("a signed-in user can never download another user's export job", async ({
  page,
}) => {
  const ownerEmail = `pw-export-owner-${Date.now()}@snapcalorie.dev`;
  const attackerEmail = `pw-export-attacker-${Date.now()}@snapcalorie.dev`;
  const password = "playwright-test-password";

  // Owner signs up, logs a meal, and creates an export job.
  await page.goto("/signup");
  await page.getByLabel("Email").fill(ownerEmail);
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

  // Force the async path (a date range over 90 days) so a real job row
  // exists for the attacker to try to steal, without following the
  // redirect — read its Location header directly to get the jobId.
  const jobResponse = await page.request.get(
    "/api/export/csv?from=2020-01-01",
    { maxRedirects: 0 },
  );
  expect(jobResponse.status()).toBe(302);
  const location = jobResponse.headers()["location"];
  const jobId = new URL(location, "http://localhost:3000").searchParams.get(
    "pending",
  );
  expect(jobId).toBeTruthy();

  // Poll until the owner's own job is ready.
  let ready = false;
  for (let i = 0; i < 15 && !ready; i++) {
    const statusRes = await page.request.get(`/api/export/jobs/${jobId}`);
    const body = await statusRes.json();
    ready = body.status === "ready";
    if (!ready) await new Promise((r) => setTimeout(r, 1000));
  }
  expect(ready).toBe(true);

  // Attacker signs up in a fresh, separate browser context (no shared cookies).
  const attackerContext = await page.context().browser()!.newContext();
  const attackerPage = await attackerContext.newPage();
  await attackerPage.goto("/signup");
  await attackerPage.getByLabel("Email").fill(attackerEmail);
  await attackerPage.getByLabel("Password").fill(password);
  await attackerPage.getByRole("button", { name: "Create account" }).click();
  await expect(attackerPage).toHaveURL(/\/dashboard$/);

  const attackerStatusRes = await attackerPage.request.get(
    `/api/export/jobs/${jobId}`,
  );
  expect(attackerStatusRes.status()).toBe(404);

  const attackerDownloadRes = await attackerPage.request.get(
    `/api/export/jobs/${jobId}/download`,
    { maxRedirects: 0 },
  );
  expect(attackerDownloadRes.status()).toBe(404);

  await attackerContext.close();
  await db.delete(users).where(eq(users.email, ownerEmail));
  await db.delete(users).where(eq(users.email, attackerEmail));
});

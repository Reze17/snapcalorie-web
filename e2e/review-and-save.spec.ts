import path from "node:path";
import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { expect, test } from "@playwright/test";
import { db } from "../src/db/client";
import {
  dailySummaries,
  mealEntries,
  mealItems,
  users,
} from "../src/db/schema";

const FIXTURE_PATH = path.join(__dirname, "fixtures", "sample-meal.jpg");

test("edits a portion, swaps an item via search, adds a custom item, saves, and persists correctly", async ({
  page,
}) => {
  const email = `pw-review-${Date.now()}@snapcalorie.dev`;
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

  // Mock provider's deterministic default plate.
  const chickenCard = page.locator(
    '[data-testid="item-card"][data-food-name="Grilled chicken breast"]',
  );
  const riceCard = page.locator(
    '[data-testid="item-card"][data-food-name="White rice, cooked"]',
  );
  await expect(chickenCard).toBeVisible();
  await expect(riceCard).toBeVisible();

  // 1. Edit a portion: 180g -> 240g should scale calories 297 -> 396.
  await expect(chickenCard.getByText("297 kcal")).toBeVisible();
  const gramsInput = chickenCard.locator('input[type="number"]');
  await gramsInput.fill("240");
  await gramsInput.blur();
  await expect(chickenCard.getByText("396 kcal")).toBeVisible();

  // 2. Swap an item via "Replace via search".
  await riceCard.getByRole("button", { name: "Replace via search" }).click();
  await page.getByPlaceholder("e.g. grilled salmon").fill("banana");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("button", { name: "Use this" }).first().click();
  const bananaCard = page.locator(
    '[data-testid="item-card"][data-food-name="Banana"]',
  );
  await expect(bananaCard).toBeVisible();

  // 3. Add a custom item.
  await page.getByPlaceholder("Food name").fill("Test Snack");
  await page.getByPlaceholder("Grams").fill("50");
  await page.getByPlaceholder("Calories").fill("100");
  await page.getByPlaceholder("Protein (g)").fill("5");
  await page.getByPlaceholder("Carbs (g)").fill("10");
  await page.getByPlaceholder("Fat (g)").fill("2");
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(
    page.locator('[data-testid="item-card"][data-food-name="Test Snack"]'),
  ).toBeVisible();

  // 4. Save.
  await page.getByRole("button", { name: "Save meal" }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });

  // 5. Assert the DB rows directly.
  const [user] = await db.select().from(users).where(eq(users.email, email));
  expect(user).toBeDefined();

  const entries = await db
    .select()
    .from(mealEntries)
    .where(eq(mealEntries.userId, user.id));
  expect(entries).toHaveLength(1);
  const entry = entries[0];

  const items = await db
    .select()
    .from(mealItems)
    .where(eq(mealItems.entryId, entry.entryId));
  expect(items).toHaveLength(4); // chicken(edited) + banana(swapped) + broccoli(untouched) + snack(added)

  const chickenRow = items.find((i) => i.foodName === "Grilled chicken breast");
  expect(chickenRow?.portionGrams).toBe("240.00");
  expect(chickenRow?.calories).toBe("396.00");
  expect(chickenRow?.isUserEdited).toBe(true);

  const bananaRow = items.find((i) => i.foodName === "Banana");
  expect(bananaRow).toBeDefined();
  expect(bananaRow?.isUserEdited).toBe(true);

  const broccoliRow = items.find((i) => i.foodName === "Broccoli, steamed");
  expect(broccoliRow).toBeDefined();
  expect(broccoliRow?.isUserEdited).toBe(false); // untouched item stays false

  const snackRow = items.find((i) => i.foodName === "Test Snack");
  expect(snackRow).toBeDefined();
  expect(snackRow?.isUserEdited).toBe(true);
  expect(snackRow?.portionGrams).toBe("50.00");

  const expectedTotalCalories = (
    396 + // chicken at 240g
    Number(bananaRow?.calories) +
    Number(broccoliRow?.calories) +
    100
  ) // snack
    .toFixed(2);
  expect(entry.totalCalories).toBe(expectedTotalCalories);

  // 6. The day's summary was updated too.
  const todayUtc = new Date().toISOString().slice(0, 10);
  const [summary] = await db
    .select()
    .from(dailySummaries)
    .where(
      and(
        eq(dailySummaries.userId, user.id),
        eq(dailySummaries.summaryDate, todayUtc),
      ),
    );
  expect(summary).toBeDefined();
  expect(summary.consumedCalories).toBe(entry.totalCalories);

  // Cleanup: cascades entries/items/summaries.
  await db.delete(users).where(eq(users.id, user.id));
});

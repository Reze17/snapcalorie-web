// @vitest-environment node
import { PDFParse } from "pdf-parse";
import { describe, expect, it } from "vitest";
import type { ExportDayGroup } from "@/lib/export";
import { generateExportPdf } from "./pdf";

async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function getPdfPageTexts(buffer: Buffer): Promise<string[]> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.pages.map((page) => page.text);
  } finally {
    await parser.destroy();
  }
}

function makeDayGroup(date: string, itemCount: number): ExportDayGroup {
  return {
    date,
    target: 2000,
    consumed: "1800.00",
    variance: "200.00",
    achievementPct: "90.00",
    entries: [
      {
        entryId: `entry-${date}`,
        loggedAt: new Date(`${date}T18:00:00.000Z`),
        localDate: date,
        totalCalories: "1800.00",
        items: Array.from({ length: itemCount }, (_, i) => ({
          foodName: `Food item ${i}`,
          portionGrams: "100.00",
          calories: "150.00",
          protein: "10.00",
          carbs: "15.00",
          fat: "5.00",
          aiConfidence: "0.90",
          isUserEdited: false,
        })),
      },
    ],
  };
}

describe("generateExportPdf", () => {
  it("produces a valid, non-empty PDF for an empty date range", async () => {
    const buffer = await generateExportPdf({
      userEmail: "test@snapcalorie.dev",
      fromDate: "2026-01-01",
      toDate: "2026-01-31",
      timezone: "America/Los_Angeles",
      generatedAt: new Date("2026-02-01T00:00:00Z"),
      dayGroups: [],
    });
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("produces a larger document for more days of data", async () => {
    const small = await generateExportPdf({
      userEmail: "test@snapcalorie.dev",
      fromDate: "2026-01-01",
      toDate: "2026-01-01",
      timezone: "America/Los_Angeles",
      generatedAt: new Date("2026-02-01T00:00:00Z"),
      dayGroups: [makeDayGroup("2026-01-01", 2)],
    });
    const large = await generateExportPdf({
      userEmail: "test@snapcalorie.dev",
      fromDate: "2026-01-01",
      toDate: "2026-12-31",
      timezone: "America/Los_Angeles",
      generatedAt: new Date("2026-02-01T00:00:00Z"),
      dayGroups: Array.from({ length: 365 }, (_, i) =>
        makeDayGroup(
          `2026-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
          3,
        ),
      ),
    });
    expect(large.length).toBeGreaterThan(small.length);
    expect(large.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("does not throw when a food name contains characters needing escaping", async () => {
    const buffer = await generateExportPdf({
      userEmail: "test@snapcalorie.dev",
      fromDate: "2026-01-01",
      toDate: "2026-01-01",
      timezone: "America/Los_Angeles",
      generatedAt: new Date("2026-02-01T00:00:00Z"),
      dayGroups: [
        {
          date: "2026-01-01",
          target: 2000,
          consumed: "500.00",
          variance: "1500.00",
          achievementPct: "25.00",
          entries: [
            {
              entryId: "e1",
              loggedAt: new Date("2026-01-01T12:00:00Z"),
              localDate: "2026-01-01",
              totalCalories: "500.00",
              items: [
                {
                  foodName: '6" sub, turkey (extra cheese)',
                  portionGrams: "220.00",
                  calories: "500.00",
                  protein: "30.00",
                  carbs: "45.00",
                  fat: "18.00",
                  aiConfidence: null,
                  isUserEdited: true,
                },
              ],
            },
          ],
        },
      ],
    });
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("renders meal times in the user's timezone, not UTC or server local time", async () => {
    // 8:00 AM in America/Los_Angeles on 2026-01-01 (PST, UTC-8) = 16:00 UTC.
    // A UTC-labeled render would wrongly show "4:00 PM".
    const buffer = await generateExportPdf({
      userEmail: "test@snapcalorie.dev",
      fromDate: "2026-01-01",
      toDate: "2026-01-01",
      timezone: "America/Los_Angeles",
      generatedAt: new Date("2026-02-01T00:00:00Z"),
      dayGroups: [
        {
          date: "2026-01-01",
          target: 2000,
          consumed: "400.00",
          variance: "1600.00",
          achievementPct: "20.00",
          entries: [
            {
              entryId: "e1",
              loggedAt: new Date("2026-01-01T16:00:00.000Z"),
              localDate: "2026-01-01",
              totalCalories: "400.00",
              items: [
                {
                  foodName: "Timezone test breakfast",
                  portionGrams: "100.00",
                  calories: "400.00",
                  protein: "10.00",
                  carbs: "40.00",
                  fat: "10.00",
                  aiConfidence: "0.90",
                  isUserEdited: false,
                },
              ],
            },
          ],
        },
      ],
    });

    const text = await extractPdfText(buffer);
    expect(text).toContain("8:00 AM");
    expect(text).not.toContain("4:00 PM");
  });

  it("keeps the day header and summary line at full page width, not squeezed into a table column", async () => {
    const buffer = await generateExportPdf({
      userEmail: "test@snapcalorie.dev",
      fromDate: "2026-01-01",
      toDate: "2026-01-02",
      timezone: "America/Los_Angeles",
      generatedAt: new Date("2026-02-01T00:00:00Z"),
      dayGroups: [makeDayGroup("2026-01-01", 1), makeDayGroup("2026-01-02", 1)],
    });

    const text = await extractPdfText(buffer);
    // A regression where doc.x got stuck at a table column's x position
    // wrapped this into one character/word per line — collapsing
    // whitespace and checking the phrase survives intact catches that.
    expect(text.replace(/\s+/g, " ")).toContain("Target 2000 kcal");
    expect(text.replace(/\s+/g, " ")).toContain("1 meal, 1 item");
  });

  it("does not append blank extra pages while stamping page-number footers", async () => {
    // Regression: writing "Page X of Y" into the bottom-margin zone made
    // pdfkit think the content overflowed and silently addPage()'d a
    // blank page per footer call, doubling the real page count while the
    // footer text itself still (wrongly) read the original, smaller total.
    const buffer = await generateExportPdf({
      userEmail: "test@snapcalorie.dev",
      fromDate: "2026-01-01",
      toDate: "2026-01-14",
      timezone: "America/Los_Angeles",
      generatedAt: new Date("2026-02-01T00:00:00Z"),
      dayGroups: Array.from({ length: 14 }, (_, i) =>
        makeDayGroup(`2026-01-${String(i + 1).padStart(2, "0")}`, 3),
      ),
    });

    const pageTexts = await getPdfPageTexts(buffer);
    const claimedTotal =
      pageTexts[0].match(/Page \d+ of (\d+)/)?.[1] ??
      pageTexts.map((t) => t.match(/Page \d+ of (\d+)/)?.[1]).find(Boolean);

    expect(claimedTotal).toBeDefined();
    expect(pageTexts.length).toBe(Number(claimedTotal));

    // Every physical page must carry real content beyond just the footer —
    // a blank extra page would be just "Page X of Y" and nothing else.
    for (const pageText of pageTexts) {
      const withoutFooter = pageText.replace(/Page \d+ of \d+/, "").trim();
      expect(withoutFooter.length).toBeGreaterThan(0);
    }
  });
});

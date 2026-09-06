import { describe, expect, it } from "vitest";
import type { ExportSourceEntry } from "@/lib/export";
import { buildCsvBuffer } from "./job-runner";

describe("buildCsvBuffer", () => {
  it("starts with a UTF-8 BOM, uses CRLF, and includes the header row", () => {
    const entries: ExportSourceEntry[] = [
      {
        entryId: "e1",
        loggedAt: new Date("2026-03-01T12:00:00Z"),
        localDate: "2026-03-01",
        totalCalories: "195.00",
        items: [
          {
            foodName: "Café latte, oat milk",
            portionGrams: "240.00",
            calories: "195.00",
            protein: "6.00",
            carbs: "18.00",
            fat: "9.00",
            aiConfidence: "0.90",
            isUserEdited: false,
          },
        ],
      },
    ];

    const buffer = buildCsvBuffer(entries, new Map(), 2000);
    expect(buffer.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));

    const text = buffer.toString("utf-8");
    const lines = text.replace(/^﻿/, "").split("\r\n");
    expect(lines[0]).toBe(
      "date,logged_at,entry_id,item_name,portion_grams,calories,protein,carbs,fat,ai_confidence,is_user_edited,entry_total_calories,daily_target,daily_consumed,daily_achievement_pct",
    );
    expect(lines[1]).toContain('"Café latte, oat milk"');
    expect(text).toContain("\r\n");
  });

  it("escapes a comma in a food name so it opens cleanly as a spreadsheet", () => {
    const entries: ExportSourceEntry[] = [
      {
        entryId: "e1",
        loggedAt: new Date("2026-03-01T12:00:00Z"),
        localDate: "2026-03-01",
        totalCalories: "100.00",
        items: [
          {
            foodName: "Rice, white, cooked",
            portionGrams: "150.00",
            calories: "100.00",
            protein: "2.00",
            carbs: "22.00",
            fat: "0.20",
            aiConfidence: null,
            isUserEdited: true,
          },
        ],
      },
    ];

    const buffer = buildCsvBuffer(entries, new Map(), 2000);
    const text = buffer.toString("utf-8");
    expect(text).toContain('"Rice, white, cooked"');
  });

  it("produces no data rows for an empty entry list, only the header", () => {
    const buffer = buildCsvBuffer([], new Map(), 2000);
    const text = buffer.toString("utf-8").replace(/^﻿/, "");
    const lines = text.split("\r\n").filter(Boolean);
    expect(lines).toHaveLength(1);
  });
});

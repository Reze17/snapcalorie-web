import { describe, expect, it } from "vitest";
import { instantToLocalDate } from "@/server/lib/timezone";
import {
  CSV_HEADERS,
  buildExportDayGroups,
  buildExportRows,
  csvEscapeField,
  csvRowLine,
  exportRowToCsvFields,
  type ExportSourceEntry,
  type ExportSourceSummary,
} from "./export";

describe("csvEscapeField", () => {
  it("leaves plain fields unchanged", () => {
    expect(csvEscapeField("Grilled chicken breast")).toBe(
      "Grilled chicken breast",
    );
  });

  it("quotes a field containing a comma", () => {
    expect(csvEscapeField("Rice, white")).toBe('"Rice, white"');
  });

  it("quotes and doubles embedded double quotes", () => {
    expect(csvEscapeField('6" sub sandwich')).toBe('"6"" sub sandwich"');
  });

  it("quotes a field containing a newline", () => {
    expect(csvEscapeField("Line one\nLine two")).toBe('"Line one\nLine two"');
  });

  it("quotes a field containing a carriage return", () => {
    expect(csvEscapeField("a\rb")).toBe('"a\rb"');
  });
});

describe("csvRowLine", () => {
  it("joins fields with commas and terminates with CRLF", () => {
    expect(csvRowLine(["a", "b", "c"])).toBe("a,b,c\r\n");
  });

  it("escapes fields that need it before joining", () => {
    expect(csvRowLine(["Rice, white", "100"])).toBe('"Rice, white",100\r\n');
  });
});

describe("CSV_HEADERS / exportRowToCsvFields", () => {
  it("keeps the header count in sync with the row field count", () => {
    const row = {
      date: "2026-03-01",
      loggedAtIso: "2026-03-01T12:00:00.000Z",
      entryId: "e1",
      itemName: "Rice",
      portionGrams: "150.00",
      calories: "195.00",
      protein: "4.00",
      carbs: "42.00",
      fat: "0.40",
      aiConfidence: "0.90",
      isUserEdited: false,
      entryTotalCalories: "195.00",
      dailyTarget: "2000",
      dailyConsumed: "195.00",
      dailyAchievementPct: "9.75",
    };
    expect(exportRowToCsvFields(row)).toHaveLength(CSV_HEADERS.length);
  });
});

const summary = (
  date: string,
  target: number,
  consumed: string,
  pct: string,
): ExportSourceSummary => ({
  summaryDate: date,
  targetCalories: target,
  consumedCalories: consumed,
  achievementPercentage: pct,
});

const entry = (
  entryId: string,
  localDate: string,
  loggedAt: Date,
  totalCalories: string,
  itemNames: string[],
): ExportSourceEntry => ({
  entryId,
  loggedAt,
  localDate,
  totalCalories,
  items: itemNames.map((foodName) => ({
    foodName,
    portionGrams: "100.00",
    calories: "100.00",
    protein: "10.00",
    carbs: "10.00",
    fat: "1.00",
    aiConfidence: "0.90",
    isUserEdited: false,
  })),
});

describe("buildExportRows", () => {
  it("produces one row per item, repeating entry and day context", () => {
    const entries = [
      entry(
        "e1",
        "2026-03-01",
        new Date("2026-03-01T18:00:00.000Z"),
        "200.00",
        ["Chicken", "Rice"],
      ),
    ];
    const summaries = new Map([
      ["2026-03-01", summary("2026-03-01", 2000, "200.00", "10.00")],
    ]);

    const rows = buildExportRows(entries, summaries, 2000);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      date: "2026-03-01",
      entryId: "e1",
      itemName: "Chicken",
      entryTotalCalories: "200.00",
      dailyTarget: "2000",
      dailyConsumed: "200.00",
      dailyAchievementPct: "10.00",
    });
    expect(rows[1].itemName).toBe("Rice");
  });

  it("falls back to the caller-supplied target when a summary row is missing", () => {
    const entries = [
      entry("e1", "2026-03-05", new Date("2026-03-05T12:00:00Z"), "100.00", [
        "Snack",
      ]),
    ];
    const rows = buildExportRows(entries, new Map(), 1800);
    expect(rows[0]).toMatchObject({
      dailyTarget: "1800",
      dailyConsumed: "0.00",
      dailyAchievementPct: "0.00",
    });
  });

  it("resolves a non-UTC entry to the correct local date", () => {
    const timezone = "America/Los_Angeles";
    // 2026-03-09 23:30 PDT = 2026-03-10T06:30:00Z
    const loggedAt = new Date("2026-03-10T06:30:00.000Z");
    const localDate = instantToLocalDate(loggedAt, timezone);
    expect(localDate).toBe("2026-03-09");

    const entries = [entry("e1", localDate, loggedAt, "100.00", ["Snack"])];
    const rows = buildExportRows(entries, new Map(), 2000);
    expect(rows[0].date).toBe("2026-03-09");
  });

  it("keeps an empty items list from producing any rows for that entry", () => {
    const entries = [
      entry("e1", "2026-03-01", new Date("2026-03-01T12:00:00Z"), "0.00", []),
    ];
    expect(buildExportRows(entries, new Map(), 2000)).toHaveLength(0);
  });
});

describe("buildExportDayGroups", () => {
  it("groups multiple entries on the same day together, sorted by time", () => {
    const entries = [
      entry("e2", "2026-03-01", new Date("2026-03-01T20:00:00Z"), "300.00", [
        "Dinner",
      ]),
      entry("e1", "2026-03-01", new Date("2026-03-01T12:00:00Z"), "200.00", [
        "Lunch",
      ]),
    ];
    const summaries = new Map([
      ["2026-03-01", summary("2026-03-01", 2000, "500.00", "25.00")],
    ]);

    const groups = buildExportDayGroups(entries, summaries, 2000);
    expect(groups).toHaveLength(1);
    expect(groups[0].entries.map((e) => e.entryId)).toEqual(["e1", "e2"]);
  });

  it("sorts groups oldest-first across a month boundary", () => {
    const entries = [
      entry("e2", "2026-03-01", new Date("2026-03-01T12:00Z"), "100.00", ["A"]),
      entry("e1", "2026-02-27", new Date("2026-02-27T12:00Z"), "100.00", ["B"]),
    ];
    const groups = buildExportDayGroups(entries, new Map(), 2000);
    expect(groups.map((g) => g.date)).toEqual(["2026-02-27", "2026-03-01"]);
  });

  it("computes variance as target minus consumed, negative when over target", () => {
    const entries = [
      entry("e1", "2026-03-01", new Date("2026-03-01T12:00Z"), "2500.00", [
        "Big meal",
      ]),
    ];
    const summaries = new Map([
      ["2026-03-01", summary("2026-03-01", 2000, "2500.00", "125.00")],
    ]);
    const groups = buildExportDayGroups(entries, summaries, 2000);
    expect(groups[0].variance).toBe("-500.00");
  });
});

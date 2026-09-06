import Decimal from "decimal.js";

export interface ExportSourceItem {
  foodName: string;
  portionGrams: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  aiConfidence: string | null;
  isUserEdited: boolean | null;
}

export interface ExportSourceEntry {
  entryId: string;
  loggedAt: Date;
  /** The entry's local calendar day — callers resolve this via instantToLocalDate before calling in. */
  localDate: string;
  totalCalories: string;
  items: ExportSourceItem[];
}

export interface ExportSourceSummary {
  summaryDate: string;
  targetCalories: number;
  consumedCalories: string;
  achievementPercentage: string;
}

export interface ExportItemRow {
  date: string;
  loggedAtIso: string;
  entryId: string;
  itemName: string;
  portionGrams: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  aiConfidence: string;
  isUserEdited: boolean;
  entryTotalCalories: string;
  dailyTarget: string;
  dailyConsumed: string;
  dailyAchievementPct: string;
}

export const CSV_HEADERS = [
  "date",
  "logged_at",
  "entry_id",
  "item_name",
  "portion_grams",
  "calories",
  "protein",
  "carbs",
  "fat",
  "ai_confidence",
  "is_user_edited",
  "entry_total_calories",
  "daily_target",
  "daily_consumed",
  "daily_achievement_pct",
];

/**
 * RFC 4180 field escaping: a field containing a comma, double quote, or a
 * line break must be wrapped in double quotes, with any embedded double
 * quotes doubled. Fields with none of those characters are left as-is.
 */
export function csvEscapeField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** CRLF line endings, per RFC 4180 — never bare \n. */
export function csvRowLine(fields: string[]): string {
  return fields.map(csvEscapeField).join(",") + "\r\n";
}

export function exportRowToCsvFields(row: ExportItemRow): string[] {
  return [
    row.date,
    row.loggedAtIso,
    row.entryId,
    row.itemName,
    row.portionGrams,
    row.calories,
    row.protein,
    row.carbs,
    row.fat,
    row.aiConfidence,
    row.isUserEdited ? "true" : "false",
    row.entryTotalCalories,
    row.dailyTarget,
    row.dailyConsumed,
    row.dailyAchievementPct,
  ];
}

function resolveDayContext(
  localDate: string,
  summariesByDate: ReadonlyMap<string, ExportSourceSummary>,
  fallbackTarget: number,
): { target: string; consumed: string; achievementPct: string } {
  const summary = summariesByDate.get(localDate);
  return {
    target: String(summary?.targetCalories ?? fallbackTarget),
    consumed: summary?.consumedCalories ?? "0.00",
    achievementPct: summary?.achievementPercentage ?? "0.00",
  };
}

/**
 * Flattens entries+items into one CSV row per item, with entry- and
 * day-level context repeated on every row (FR-10). A day's target/consumed
 * come from that day's own daily_summaries row when one exists — falling
 * back to the caller-supplied target only covers the defensive case where a
 * summary row is unexpectedly missing (recalculateDailySummary always
 * upserts one alongside entry creation, so this should not happen in
 * practice, but export must not crash if it ever does).
 */
export function buildExportRows(
  entries: ExportSourceEntry[],
  summariesByDate: ReadonlyMap<string, ExportSourceSummary>,
  fallbackTarget: number,
): ExportItemRow[] {
  const rows: ExportItemRow[] = [];

  for (const entry of entries) {
    const day = resolveDayContext(
      entry.localDate,
      summariesByDate,
      fallbackTarget,
    );

    for (const item of entry.items) {
      rows.push({
        date: entry.localDate,
        loggedAtIso: entry.loggedAt.toISOString(),
        entryId: entry.entryId,
        itemName: item.foodName,
        portionGrams: item.portionGrams,
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
        aiConfidence: item.aiConfidence ?? "",
        isUserEdited: item.isUserEdited ?? false,
        entryTotalCalories: entry.totalCalories,
        dailyTarget: day.target,
        dailyConsumed: day.consumed,
        dailyAchievementPct: day.achievementPct,
      });
    }
  }

  return rows;
}

export interface ExportDayGroup {
  date: string;
  target: number;
  consumed: string;
  variance: string;
  achievementPct: string;
  entries: ExportSourceEntry[];
}

/**
 * Groups entries by local calendar day for the PDF's per-day breakdown,
 * sorted oldest-first with each day's entries sorted by logged_at. variance
 * is target - consumed (same sign convention as computeDailyMetrics'
 * `remaining` — positive means under target, negative means over).
 */
export function buildExportDayGroups(
  entries: ExportSourceEntry[],
  summariesByDate: ReadonlyMap<string, ExportSourceSummary>,
  fallbackTarget: number,
): ExportDayGroup[] {
  const byDate = new Map<string, ExportSourceEntry[]>();

  for (const entry of entries) {
    const list = byDate.get(entry.localDate) ?? [];
    list.push(entry);
    byDate.set(entry.localDate, list);
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, dayEntries]) => {
      const day = resolveDayContext(date, summariesByDate, fallbackTarget);
      const variance = new Decimal(day.target).minus(day.consumed).toFixed(2);
      return {
        date,
        target: Number(day.target),
        consumed: day.consumed,
        variance,
        achievementPct: day.achievementPct,
        entries: [...dayEntries].sort(
          (a, b) => a.loggedAt.getTime() - b.loggedAt.getTime(),
        ),
      };
    });
}

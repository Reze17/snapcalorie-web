import PDFDocument from "pdfkit";
import type { ExportDayGroup } from "@/lib/export";

export interface PdfExportInput {
  userEmail: string;
  fromDate: string;
  toDate: string;
  generatedAt: Date;
  timezone: string;
  dayGroups: ExportDayGroup[];
}

const MARGIN = 50;
const PAGE_SIZE = "A4";
const FOOTER_RESERVE = 30;

// Column layout for the per-day item table, widths in points, summing to
// well under A4's usable width (595.28 - 2*50 = 495.28).
const COLUMNS: { label: string; width: number }[] = [
  { label: "Time", width: 50 },
  { label: "Item", width: 140 },
  { label: "Grams", width: 50 },
  { label: "Calories", width: 55 },
  { label: "Protein", width: 45 },
  { label: "Carbs", width: 45 },
  { label: "Fat", width: 40 },
  { label: "Conf.", width: 35 },
  { label: "Edited", width: 35 },
];

function columnX(index: number): number {
  let x = MARGIN;
  for (let i = 0; i < index; i++) {
    x += COLUMNS[i].width;
  }
  return x;
}

/**
 * doc.text(str, x, y, {width}) leaves doc.x pinned at that x afterward, so
 * any later doc.text(str) call with no explicit position (the day/entry
 * headers) would inherit the last column's x and get squeezed into a
 * ~40pt-wide column instead of the full page width. Reset the cursor back
 * to the left margin before every full-width text block.
 */
function resetCursorToMargin(doc: PDFKit.PDFDocument) {
  doc.x = doc.page.margins.left;
}

function drawTableHeader(doc: PDFKit.PDFDocument) {
  const y = doc.y;
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#333");
  COLUMNS.forEach((col, i) => {
    doc.text(col.label, columnX(i), y, { width: col.width, lineBreak: false });
  });
  doc.font("Helvetica").fillColor("#000");
  resetCursorToMargin(doc);
  doc.y = y + 12;
  doc
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .strokeColor("#ccc")
    .stroke();
  doc.y += 4;
}

function drawTableRow(
  doc: PDFKit.PDFDocument,
  cells: [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ],
) {
  const y = doc.y;
  doc.fontSize(8).fillColor("#000");
  cells.forEach((cell, i) => {
    doc.text(cell, columnX(i), y, {
      width: COLUMNS[i].width,
      lineBreak: false,
    });
  });
  resetCursorToMargin(doc);
  doc.y = y + 14;
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
    resetCursorToMargin(doc);
  }
}

function formatTime(date: Date, timezone: string): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  });
}

/**
 * Server-side PDF generation via pdfkit (no headless Chrome, per FR-10).
 * Buffers the whole document in memory before resolving — fine at this
 * app's scale (a year of history is at most a few hundred KB) since this
 * only ever runs off the request path (see the export job runner for
 * ranges over 90 days).
 */
export function generateExportPdf(input: PdfExportInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: PAGE_SIZE,
      margin: MARGIN,
      bufferPages: true,
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(20).text("SnapCalorie Export");
    doc.moveDown(0.3);
    resetCursorToMargin(doc);
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#555")
      .text(`Account: ${input.userEmail}`)
      .text(`Date range: ${input.fromDate} to ${input.toDate}`)
      .text(`Generated: ${input.generatedAt.toISOString()}`);
    doc.fillColor("#000");
    doc.moveDown(1);
    resetCursorToMargin(doc);

    if (input.dayGroups.length === 0) {
      doc.fontSize(12).text("No entries in this date range.");
    }

    for (const day of input.dayGroups) {
      ensureSpace(doc, 100);
      resetCursorToMargin(doc);
      doc.font("Helvetica-Bold").fontSize(13).text(day.date);
      resetCursorToMargin(doc);
      const totalItems = day.entries.reduce(
        (sum, e) => sum + e.items.length,
        0,
      );
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#555")
        .text(
          `Target ${day.target} kcal   Consumed ${day.consumed} kcal   ` +
            `Variance ${day.variance} kcal   Achievement ${day.achievementPct}%`,
        );
      resetCursorToMargin(doc);
      doc.text(
        `${day.entries.length} meal${day.entries.length === 1 ? "" : "s"}, ${totalItems} item${totalItems === 1 ? "" : "s"}`,
      );
      doc.fillColor("#000");
      resetCursorToMargin(doc);
      doc.moveDown(0.4);

      drawTableHeader(doc);
      for (const entry of day.entries) {
        for (const item of entry.items) {
          ensureSpace(doc, 40);
          if (doc.y === doc.page.margins.top) {
            drawTableHeader(doc);
          }
          drawTableRow(doc, [
            formatTime(entry.loggedAt, input.timezone),
            item.foodName,
            item.portionGrams,
            item.calories,
            item.protein,
            item.carbs,
            item.fat,
            item.aiConfidence ?? "—",
            item.isUserEdited ? "yes" : "no",
          ]);
        }
      }
      resetCursorToMargin(doc);
      doc.moveDown(0.8);
    }

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      // Writing into the bottom-margin zone would otherwise make pdfkit
      // think the text overflowed the page and silently addPage() a blank
      // extra page per footer — zeroing the bottom margin for this one
      // call disables that auto-pagination check.
      const bottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#999")
        .text(
          `Page ${i + 1} of ${range.count}`,
          MARGIN,
          doc.page.height - FOOTER_RESERVE,
          {
            width: doc.page.width - MARGIN * 2,
            align: "center",
            lineBreak: false,
          },
        );
      doc.page.margins.bottom = bottomMargin;
    }

    doc.end();
  });
}

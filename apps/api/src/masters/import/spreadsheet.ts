import { BadRequestException } from "@nestjs/common";
import ExcelJS from "exceljs";

/**
 * Reads the first worksheet of an .xlsx or a .csv into rows keyed by header.
 *
 * Headers are normalised — lowercased, non-alphanumerics collapsed — so
 * "Product Code", "product_code" and "PRODUCT CODE" all resolve to the same
 * column. A courier company's spreadsheet has been through a dozen hands, and
 * refusing it over a capital letter helps nobody.
 *
 * Values arrive as whatever Excel decided they were: a code like "0012" becomes
 * a number, a formula cell arrives as an object. Everything is reduced to a
 * trimmed string here so validation downstream sees one shape.
 */

export interface ParsedSheet {
  /** Normalised header keys, in the order they appear. */
  readonly headers: readonly string[];
  /** Original header text, for error messages that match what the user sees. */
  readonly originalHeaders: readonly string[];
  readonly rows: ReadonlyArray<Record<string, string>>;
}

export function normaliseHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();

  if (typeof value === "object") {
    // Formula cells carry their computed result; rich text arrives in fragments.
    if ("result" in value && value.result !== undefined) return cellToString(value.result as ExcelJS.CellValue);
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((fragment) => fragment.text).join("").trim();
    }
    if ("text" in value && typeof value.text === "string") return value.text.trim();
  }

  return String(value).trim();
}

export async function parseSpreadsheet(
  buffer: Buffer,
  filename: string,
  limit = 5000,
): Promise<ParsedSheet> {
  const workbook = new ExcelJS.Workbook();

  try {
    if (filename.toLowerCase().endsWith(".csv")) {
      // ExcelJS's CSV reader takes a stream; a Readable over the buffer avoids
      // writing the upload to disk just to read it back.
      const { Readable } = await import("node:stream");
      await workbook.csv.read(Readable.from(buffer));
    } else {
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    }
  } catch {
    throw new BadRequestException(
      "That file could not be read. Save it as .xlsx or .csv and try again.",
    );
  }

  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 2) {
    throw new BadRequestException("The file has no data rows — expected a header row and at least one row below it.");
  }

  const headerRow = sheet.getRow(1);
  const originalHeaders: string[] = [];
  const headers: string[] = [];

  headerRow.eachCell({ includeEmpty: false }, (cell) => {
    const text = cellToString(cell.value);
    originalHeaders.push(text);
    headers.push(normaliseHeader(text));
  });

  if (headers.length === 0) {
    throw new BadRequestException("The first row must contain column headings.");
  }

  const rows: Array<Record<string, string>> = [];

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    if (rows.length >= limit) return;

    const record: Record<string, string> = {};
    let hasValue = false;

    headers.forEach((header, index) => {
      const value = cellToString(row.getCell(index + 1).value);
      record[header] = value;
      if (value) hasValue = true;
    });

    // Trailing blank rows are an artefact of how spreadsheets are edited, not
    // data. Skipping them silently is right; counting them as errors is not.
    if (hasValue) rows.push(record);
  });

  if (rows.length === 0) {
    throw new BadRequestException("The file has headings but no data rows.");
  }

  if (sheet.rowCount - 1 > limit) {
    throw new BadRequestException(
      `That file has more than ${limit} rows. Split it — an import this size belongs in the migration subsystem, not a settings screen.`,
    );
  }

  return { headers, originalHeaders, rows };
}

export interface RowOutcome {
  /** 1-based row number in the original file, header included, so it matches Excel. */
  row: number;
  status: "create" | "update" | "error";
  code: string;
  message?: string;
}

export interface ImportReport {
  mode: "preview" | "commit";
  total: number;
  created: number;
  updated: number;
  failed: number;
  /** True when a commit was refused because some rows failed validation. */
  aborted: boolean;
  outcomes: RowOutcome[];
}

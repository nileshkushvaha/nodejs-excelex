import { BadRequestException } from "@nestjs/common";
import ExcelJS from "exceljs";
import JSZip from "jszip";

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

/**
 * Excel's own escape: a leading apostrophe marks the rest as text and is not
 * part of the value. Exports write one in front of anything starting with =,
 * +, - or @ so a cell cannot execute as a formula; without stripping it here,
 * a value that made the round trip would gain a permanent apostrophe.
 *
 * Only stripped ahead of those four characters. A name that genuinely starts
 * with an apostrophe keeps it.
 */
function stripFormulaGuard(text: string): string {
  return /^'[=+\-@]/.test(text) ? text.slice(1) : text;
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return stripFormulaGuard(value.trim());
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

/** The eight bytes every OLE2 compound document starts with. */
const OLE2_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

/**
 * Rewrites a valid-but-unusual workbook into the shape ExcelJS insists on.
 *
 * Two things the spec allows and ExcelJS does not:
 *
 *   1. Namespace prefixes. `<x:worksheet>` and `<worksheet>` are the same
 *      element to any namespace-aware reader, and Excel treats them
 *      identically. ExcelJS matches element names as plain strings, so a
 *      prefixed file yields a workbook with no sheets and then throws.
 *
 *   2. Worksheet file names. ExcelJS looks for `xl/worksheets/sheet<N>.xml`
 *      and ignores anything else, even though the real name is whatever the
 *      relationship points at. A file with one sheet called `sheet.xml`
 *      loads as a workbook with no worksheets and no error.
 *
 * Neither is hypothetical. The client's own export is written by
 * SpreadsheetLight, a .NET library that does both, so every file their staff
 * export from the legacy system hits both bugs. Refusing those files would
 * make this importer useless for the one job it exists to do.
 *
 * Returns the buffer untouched when nothing needs changing, so the common
 * path costs one read of workbook.xml.
 */
async function normaliseOoxml(buffer: Buffer): Promise<Buffer> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    // Not a zip at all. Let ExcelJS produce the error.
    return buffer;
  }

  const workbook = zip.file("xl/workbook.xml");
  if (!workbook) return buffer;

  const head = await workbook.async("string");
  const prefix = /<([A-Za-z0-9_]+):workbook[\s>]/.exec(head)?.[1];

  // Worksheets ExcelJS would skip, and the name it will look for instead.
  const renames = new Map<string, string>();
  let next = 1;
  for (const path of Object.keys(zip.files)) {
    const match = /^xl\/worksheets\/([^/]+)\.xml$/.exec(path);
    if (!match || /^sheet\d+$/.test(match[1]!)) continue;
    renames.set(path, `xl/worksheets/sheet${next}.xml`);
    next += 1;
  }

  if (!prefix && renames.size === 0) return buffer;

  if (prefix) {
    const open = new RegExp(`<${prefix}:`, "g");
    const close = new RegExp(`</${prefix}:`, "g");
    // The declaration is kept but renamed rather than deleted: an xmlns
    // binding nothing refers to is harmless, and removing attributes by
    // regex is how you corrupt a file that was fine.
    const declaration = new RegExp(`xmlns:${prefix}=`, "g");

    for (const path of Object.keys(zip.files)) {
      if (!path.endsWith(".xml") && !path.endsWith(".rels")) continue;
      const file = zip.file(path);
      if (!file) continue;

      const xml = await file.async("string");
      // Only the spreadsheetml prefix is stripped. Relationship attributes
      // (r:id) carry a different namespace and must survive untouched.
      zip.file(path, xml.replace(open, "<").replace(close, "</").replace(declaration, "xmlns:unused="));
    }
  }

  for (const [from, to] of renames) {
    const file = zip.file(from);
    if (!file) continue;
    zip.file(to, await file.async("nodebuffer"));
    zip.remove(from);

    // The relationship still points at the old name, and it is the
    // relationship — not the file name — that the workbook actually follows.
    const rels = zip.file("xl/_rels/workbook.xml.rels");
    if (rels) {
      const oldTarget = from.replace(/^xl\//, "");
      const newTarget = to.replace(/^xl\//, "");
      zip.file(
        "xl/_rels/workbook.xml.rels",
        (await rels.async("string")).split(oldTarget).join(newTarget),
      );
    }
  }

  return zip.generateAsync({ type: "nodebuffer" });
}

export async function parseSpreadsheet(
  buffer: Buffer,
  filename: string,
  limit = 5000,
): Promise<ParsedSheet> {
  // .xls is a compound document, not a zip, and no amount of extension
  // renaming changes that. Named explicitly because "could not be read" sends
  // people looking for corruption in a file that is perfectly fine.
  if (buffer.subarray(0, 8).equals(OLE2_MAGIC)) {
    throw new BadRequestException(
      "That is an Excel 97–2003 file (.xls). Open it and use Save As to make an .xlsx or .csv, then upload that.",
    );
  }

  const workbook = new ExcelJS.Workbook();

  try {
    if (filename.toLowerCase().endsWith(".csv")) {
      // ExcelJS's CSV reader takes a stream; a Readable over the buffer avoids
      // writing the upload to disk just to read it back.
      const { Readable } = await import("node:stream");
      await workbook.csv.read(Readable.from(buffer));
    } else {
      const readable = await normaliseOoxml(buffer);
      await workbook.xlsx.load(readable as unknown as ArrayBuffer);
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

      // Two columns can normalise to the same key — the client's own export
      // has both "Customer_Status" (a number nobody reads) and
      // "CustomerStatus" (the word people mean). A later column wins only
      // when it actually carries a value, so an empty duplicate cannot erase
      // a stated one.
      if (value || record[header] === undefined) record[header] = value;
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
  /**
   * "skipped" is not a failure: the row or column was read, understood and
   * deliberately not applied. It must not be silent — an import that quietly
   * drops a column leaves people believing data arrived that did not.
   */
  status: "create" | "update" | "error" | "skipped";
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

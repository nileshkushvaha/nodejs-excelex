import ExcelJS from "exceljs";

/**
 * Writes a sheet the client's staff can open, edit and hand straight back.
 *
 * The whole point of matching their column set is the round trip, so the file
 * this produces has to be one our own importer accepts. Three things make
 * that true and are easy to get wrong:
 *
 *   - Codes are written as text. "0012" as a number comes back as 12, and a
 *     customer code that loses its leading zero is a customer nobody can find.
 *   - Dates are written as dates with a dd/mm/yyyy format, which is what
 *     their data uses, rather than as strings that Excel re-interprets on the
 *     way in.
 *   - A value beginning =, +, - or @ is prefixed with an apostrophe, because
 *     a cell starting with = is a formula and customer names are typed by
 *     whoever rang the counter.
 */
export type CellValue = string | number | boolean | Date | null | undefined;

export async function buildWorkbook(
  sheetName: string,
  headers: readonly string[],
  rows: ReadonlyArray<readonly CellValue[]>,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ExcelEx";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName, {
    // The header stays put while somebody scrolls a few thousand rows, which
    // is the difference between a usable export and a puzzle.
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.addRow([...headers]);
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: "middle" };

  for (const row of rows) {
    const cells = row.map((value) => {
      if (value === null || value === undefined) return "";
      if (typeof value === "string" && /^[=+\-@\t\r]/.test(value)) return `'${value}`;
      return value;
    });
    sheet.addRow(cells);
  }

  // Wide enough to read without being wide enough to need scrolling. Measured
  // over the first few hundred rows only: the widest cell in twenty thousand
  // is usually one bad address nobody needs to see in full.
  headers.forEach((header, index) => {
    let width = header.length + 2;
    for (const row of rows.slice(0, 300)) {
      const value = row[index];
      const length = value instanceof Date ? 10 : String(value ?? "").length;
      if (length + 2 > width) width = length + 2;
    }
    sheet.getColumn(index + 1).width = Math.min(42, Math.max(10, width));
  });

  for (const column of sheet.columns) {
    const sample = rows.find((row) => row[(column.number ?? 1) - 1] instanceof Date);
    if (sample) column.numFmt = "dd/mm/yyyy";
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** The content type browsers and Excel both recognise for .xlsx. */
export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

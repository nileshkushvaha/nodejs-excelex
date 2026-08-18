import type { Response } from "express";

/**
 * CSV, streamed a page at a time.
 *
 * An export of a log is not a master export: fifty thousand rows is a normal
 * week, not an edge case, and buffering the lot into one string is how a
 * report endpoint becomes the thing that takes the API down. So the response
 * is opened first, and each page is written as it is read. The row cap is
 * enforced here rather than trusted to the caller, so a query that matches
 * everything still ends.
 *
 * Cells are quoted, doubled-quote-escaped, and a leading =, +, - or @ is
 * prefixed with an apostrophe: a spreadsheet treats those as formulas, and a
 * user agent string is attacker-controlled text.
 */
export const CSV_ROW_CAP = 50_000;
export const CSV_PAGE = 1_000;

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const text =
    value instanceof Date
      ? value.toISOString()
      : typeof value === "object"
        ? JSON.stringify(value)
        : typeof value === "string"
          ? value
          : // eslint-disable-next-line @typescript-eslint/no-base-to-string -- primitives only by this point
            String(value);
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export async function streamCsv<Row>(
  response: Response,
  filename: string,
  headers: readonly string[],
  readPage: (skip: number, take: number) => Promise<Row[]>,
  toCells: (row: Row) => readonly unknown[],
): Promise<number> {
  response.setHeader("content-type", "text/csv; charset=utf-8");
  response.setHeader("content-disposition", `attachment; filename="${filename}"`);
  response.setHeader("cache-control", "no-store");
  response.write(`${headers.join(",")}\n`);

  let written = 0;
  while (written < CSV_ROW_CAP) {
    const take = Math.min(CSV_PAGE, CSV_ROW_CAP - written);
    const rows = await readPage(written, take);
    if (rows.length === 0) break;

    const chunk = rows.map((row) => toCells(row).map(csvCell).join(",")).join("\n");
    // Backpressure: wait for the socket to drain rather than piling pages into
    // memory faster than the client reads them.
    if (!response.write(`${chunk}\n`)) {
      await new Promise<void>((resolve) => response.once("drain", () => resolve()));
    }

    written += rows.length;
    if (rows.length < take) break;
  }

  response.end();
  return written;
}

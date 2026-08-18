import type { Action, Resource } from "@excelex/permissions";

import type { CellValue } from "./workbook";
import { normaliseHeader } from "./spreadsheet";

/**
 * A master, described rather than coded.
 *
 * Every master's import is the same six steps — read the sheet, match the
 * headers, validate each row, reject duplicates, upsert by code, audit — and
 * the only thing that differs is the columns. Written out per master, that is
 * two hundred lines of identical machinery around a list, and the parser bug
 * found in one copy stays in the other seven.
 *
 * So the columns are the declaration and the machinery is shared. Adding a
 * master to the import and export surface is a spec, not a service.
 */

/** What a column can do in each direction. */
export interface ColumnSpec<Row = Record<string, unknown>> {
  /** The heading written to the template and the export. */
  readonly header: string;

  /**
   * Other spellings accepted on the way in, already normalised.
   *
   * The header itself is always accepted; these are for the shapes real files
   * arrive in — "Tel No. 1" from their template, "customer_tel1" from the
   * legacy export.
   */
  readonly aliases?: readonly string[];

  /** The cell this column writes when exporting a row. */
  readonly write: (row: Row) => CellValue;

  /**
   * Reads the cell into the data being built.
   *
   * Returns a message to reject the row, or nothing to accept it. Columns
   * that are export-only omit this — a computed count belongs in the file
   * somebody reads, not in the one they upload.
   */
  readonly read?: (value: string, into: Record<string, unknown>, context: ReadContext) => string | void;

  /** Rejects the row when the cell is empty. */
  readonly required?: boolean;
}

/** What a column can look up while reading: the other masters, by code or name. */
export interface ReadContext {
  /** `lookup("destination", "DEL")` → the row's id, or undefined. */
  readonly lookup: (name: string, text: string) => string | undefined;
}

export interface LookupSpec {
  /** The name `read` uses, and the Prisma delegate the rows come from. */
  readonly name: string;
  readonly model: string;
}

export interface MasterSpec<Row = Record<string, unknown>> {
  /** The URL segment, and how the master is named in messages. */
  readonly key: string;
  readonly label: { one: string; many: string };

  /** The policy resource, so export and import inherit its permissions. */
  readonly resource: Resource;

  /** The Prisma delegate. */
  readonly model: string;

  /** Rows referenced by code or name in the file. */
  readonly lookups?: readonly LookupSpec[];

  /** Relations the export needs loaded. */
  readonly include?: Record<string, boolean>;

  /**
   * Fixed columns that narrow this master within a shared table.
   *
   * The six short lists live in one table separated by a kind, so a spec for
   * industries must export only industries and must stamp the kind on every
   * row it creates. Without it, exporting industries would hand back vendors
   * too, and importing them would create rows belonging to no list.
   */
  readonly scope?: Record<string, unknown>;

  readonly columns: readonly ColumnSpec<Row>[];

  /**
   * An example row for the template.
   *
   * Filled in, because an empty template leaves people guessing what a column
   * wants and typing something the importer will reject.
   */
  readonly example?: readonly CellValue[];

  /** Import is refused when absent — some masters are export-only. */
  readonly importable?: boolean;
}

/** The headers a spec writes, in order. */
export function headersOf(spec: MasterSpec): string[] {
  return spec.columns.map((column) => column.header);
}

/**
 * Every spelling a column answers to, normalised.
 *
 * The header is included automatically, so a spec only lists the spellings
 * that differ from what it writes.
 */
export function acceptedNames(column: ColumnSpec): string[] {
  return [normaliseHeader(column.header), ...(column.aliases ?? []).map(normaliseHeader)];
}

// ── Column builders ─────────────────────────────────────────────────────────
// Named for what the column is, not for its type, so a spec reads as a
// description of the master rather than as a list of parsers.

export function text(
  header: string,
  field: string,
  options: { aliases?: readonly string[]; required?: boolean; upper?: boolean } = {},
): ColumnSpec<Record<string, unknown>> {
  return {
    header,
    aliases: options.aliases,
    required: options.required,
    write: (row) => (row[field] as string | null) ?? "",
    read: (value, into) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      into[field] = options.upper ? trimmed.toUpperCase() : trimmed;
    },
  };
}

export function decimal(
  header: string,
  field: string,
  options: { aliases?: readonly string[]; min?: number; max?: number } = {},
): ColumnSpec<Record<string, unknown>> {
  return {
    header,
    aliases: options.aliases,
    // As a string, because a rupee amount through a JavaScript number comes
    // back subtly different and these multiply invoices.
    write: (row) => (row[field] === null || row[field] === undefined ? "" : String(row[field])),
    read: (value, into) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return `"${trimmed}" is not a number.`;

      const numeric = Number(trimmed);
      if (options.min !== undefined && numeric < options.min) {
        return `${trimmed} is below the minimum of ${options.min}.`;
      }
      if (options.max !== undefined && numeric > options.max) {
        return `${trimmed} is above the maximum of ${options.max}.`;
      }
      into[field] = trimmed;
    },
  };
}

export function integer(
  header: string,
  field: string,
  options: { aliases?: readonly string[]; min?: number; max?: number } = {},
): ColumnSpec<Record<string, unknown>> {
  return {
    header,
    aliases: options.aliases,
    write: (row) => (row[field] as number | null) ?? "",
    read: (value, into) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      const numeric = Number(trimmed);
      if (!Number.isInteger(numeric)) return `"${trimmed}" is not a whole number.`;
      if (options.min !== undefined && numeric < options.min) return `${trimmed} is too small.`;
      if (options.max !== undefined && numeric > options.max) return `${trimmed} is too large.`;
      into[field] = numeric;
    },
  };
}

/**
 * Yes and no, in the dozen shapes real files use.
 *
 * Punctuation is stripped before matching because the client's own export
 * writes "In-Active", which read as unrecognised and quietly imported every
 * closed account as open.
 */
export function flag(
  header: string,
  field: string,
  options: { aliases?: readonly string[] } = {},
): ColumnSpec<Record<string, unknown>> {
  return {
    header,
    aliases: options.aliases,
    write: (row) => (row[field] ? "Yes" : "No"),
    read: (value, into) => {
      const parsed = parseFlag(value);
      if (parsed === undefined) {
        if (value.trim()) return `"${value}" is not a yes or a no.`;
        return;
      }
      into[field] = parsed;
    },
  };
}

/** Active/In-Active, which is a flag wearing different words. */
export function status(field = "isActive"): ColumnSpec<Record<string, unknown>> {
  return {
    header: "Status",
    aliases: ["active", "isactive", "customerstatus"],
    write: (row) => (row[field] ? "Active" : "In-Active"),
    read: (value, into) => {
      const parsed = parseFlag(value);
      if (parsed === undefined) {
        if (value.trim()) return `"${value}" is not a status — use Active or In-Active.`;
        return;
      }
      into[field] = parsed;
    },
  };
}

export function parseFlag(value: string): boolean | undefined {
  const text = value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!text) return undefined;
  if (["y", "yes", "true", "1", "active", "on"].includes(text)) return true;
  if (["n", "no", "false", "0", "inactive", "off", "closed"].includes(text)) return false;
  return undefined;
}

export function choice<T extends string>(
  header: string,
  field: string,
  members: readonly T[],
  options: { aliases?: readonly string[] } = {},
): ColumnSpec<Record<string, unknown>> {
  return {
    header,
    aliases: options.aliases,
    write: (row) => (row[field] as string | null) ?? "",
    read: (value, into) => {
      const trimmed = value.trim();
      if (!trimmed) return;

      // "Co-Courier", "co courier" and "CO_COURIER" are the same answer.
      const key = normaliseHeader(trimmed);
      const found = members.find((member) => normaliseHeader(member) === key);
      if (!found) return `"${trimmed}" must be one of: ${members.join(", ")}.`;
      into[field] = found;
    },
  };
}

export function date(
  header: string,
  field: string,
  options: { aliases?: readonly string[] } = {},
): ColumnSpec<Record<string, unknown>> {
  return {
    header,
    aliases: options.aliases,
    write: (row) => (row[field] as Date | null) ?? "",
    read: (value, into) => {
      const parsed = parseDate(value);
      if (parsed === undefined) {
        if (value.trim()) return `"${value}" is not a date — use dd/mm/yyyy or yyyy-mm-dd.`;
        return;
      }
      into[field] = new Date(`${parsed}T00:00:00Z`);
    },
  };
}

/**
 * The three date shapes these files contain.
 *
 * Nothing is guessed: an unrecognised value fails the row, because a silently
 * wrong start date is a silently wrong contract.
 */
export function parseDate(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
  if (!dmy) return undefined;

  const day = Number(dmy[1]);
  const month = Number(dmy[2]);
  if (day < 1 || day > 31 || month < 1 || month > 12) return undefined;
  return `${dmy[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * A reference to another master, by its code or its name.
 *
 * Both, because a file exported for humans says "Delhi" and one exported from
 * the old system says "DEL", and refusing either would be pedantry.
 */
export function reference(
  header: string,
  field: string,
  lookup: string,
  options: { aliases?: readonly string[]; relation?: string; required?: boolean } = {},
): ColumnSpec<Record<string, unknown>> {
  const relation = options.relation ?? field.replace(/Id$/, "");

  return {
    header,
    aliases: options.aliases,
    required: options.required,
    write: (row) => {
      const related = row[relation] as { code?: string; name?: string } | null | undefined;
      return related?.code ?? related?.name ?? "";
    },
    read: (value, into, context) => {
      const trimmed = value.trim();
      if (!trimmed) return;

      const id = context.lookup(lookup, trimmed);
      if (!id) return `"${trimmed}" is not a ${lookup} that exists. Create it first, or correct the spelling.`;
      into[field] = id;
    },
  };
}

/** A column the export writes and the import ignores. */
export function readOnly<Row = Record<string, unknown>>(
  header: string,
  write: (row: Row) => CellValue,
): ColumnSpec<Row> {
  return { header, write };
}

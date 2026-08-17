import { Injectable } from "@nestjs/common";

import { requireRequestContext } from "../../core/context/request-context";
import { PrismaService } from "../../core/database/prisma.service";
import { normaliseHeader, parseSpreadsheet, type ImportReport, type RowOutcome } from "./spreadsheet";

/**
 * Spreadsheet import for the product master.
 *
 * Two modes, and preview is not optional in the UI. A courier company's product
 * list arrives as a spreadsheet that has been through several hands, and the
 * useful question is never "did it work" but "what exactly is about to change".
 * Preview answers that per row, without writing anything.
 *
 * Import is an upsert by code rather than an insert: re-importing a corrected
 * file is the normal way people use this, and making the second attempt fail on
 * duplicates would mean deleting everything first.
 */

/** Accepted spellings for each column, normalised. */
const COLUMNS = {
  code: ["productcode", "code"],
  name: ["productname", "name"],
  type: ["producttype", "type"],
  group: ["grouptype", "group", "productgroup"],
  service: ["productservice", "service"],
  content: ["content", "contentkind", "doxndox", "dox"],
  fuelCharge: ["fuelcharge", "fuel"],
  gstReverse: ["gstreverse", "reversecharge", "rcm"],
  isActive: ["status", "active", "isactive"],
} as const;

function pick(row: Record<string, string>, names: readonly string[]): string {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== "") return value;
  }
  return "";
}

/**
 * Spreadsheets express yes and no a dozen ways, and every one of them appears
 * in real data. An unrecognised value is left undefined so the caller can fall
 * back to a default rather than silently reading it as false.
 */
function parseBoolean(value: string): boolean | undefined {
  const text = value.trim().toLowerCase();
  if (!text) return undefined;
  if (["y", "yes", "true", "1", "active", "on"].includes(text)) return true;
  if (["n", "no", "false", "0", "inactive", "off"].includes(text)) return false;
  return undefined;
}

@Injectable()
export class ProductImportService {
  constructor(private readonly prisma: PrismaService) {}

  /** The columns an import file may carry, for the template download. */
  static readonly TEMPLATE_HEADERS = [
    "Product Code",
    "Product Name",
    "Product Type",
    "Group Type",
    "Product Service",
    "Content",
    "Fuel Charge",
    "GST Reverse",
    "Status",
  ];

  async run(
    buffer: Buffer,
    filename: string,
    mode: "preview" | "commit",
  ): Promise<ImportReport> {
    const { clientId, actor } = requireRequestContext();
    const sheet = await parseSpreadsheet(buffer, filename);

    return this.prisma.forClient(clientId!, async (tx) => {
      const [types, groups, existing] = await Promise.all([
        tx.productType.findMany({ where: { deletedAt: null } }),
        tx.productGroup.findMany({ where: { deletedAt: null } }),
        tx.product.findMany({ where: { deletedAt: null } }),
      ]);

      // Both code and name are accepted for the classification columns: a
      // spreadsheet exported for humans says "Domestic", one exported from the
      // old system says "DOM", and refusing either would be pedantry.
      const typeByKey = new Map<string, string>();
      for (const type of types) {
        typeByKey.set(normaliseHeader(type.code), type.id);
        typeByKey.set(normaliseHeader(type.name), type.id);
      }
      const groupByKey = new Map<string, string>();
      for (const group of groups) {
        groupByKey.set(normaliseHeader(group.code), group.id);
        groupByKey.set(normaliseHeader(group.name), group.id);
      }

      const existingByCode = new Map(existing.map((product) => [product.code, product]));
      const seenInFile = new Set<string>();
      const outcomes: RowOutcome[] = [];
      /** Validated rows, held back until every row has been checked. */
      const pending: Array<{ id: string | null; data: Record<string, unknown> }> = [];

      for (const [index, row] of sheet.rows.entries()) {
        // +2 because row 1 is the header and spreadsheets are 1-based, so this
        // number is the one the user sees in Excel's gutter.
        const rowNumber = index + 2;
        const code = pick(row, COLUMNS.code).trim().toUpperCase();
        const name = pick(row, COLUMNS.name).trim();

        const fail = (message: string) =>
          outcomes.push({ row: rowNumber, status: "error", code: code || "—", message });

        if (!code) {
          fail("Product code is missing.");
          continue;
        }
        if (!/^[A-Z0-9-]{2,20}$/.test(code)) {
          fail(`"${code}" is not a valid code — letters, numbers and hyphens, 2 to 20 characters.`);
          continue;
        }
        if (!name) {
          fail("Product name is missing.");
          continue;
        }
        // Caught here rather than at the database, which would only see the
        // second write and report a constraint violation with no row number.
        if (seenInFile.has(code)) {
          fail(`"${code}" appears more than once in this file.`);
          continue;
        }
        seenInFile.add(code);

        const typeText = pick(row, COLUMNS.type).trim();
        const typeId = typeText ? typeByKey.get(normaliseHeader(typeText)) : null;
        if (typeText && !typeId) {
          fail(`Product type "${typeText}" does not exist. Create it first, or correct the spelling.`);
          continue;
        }

        const groupText = pick(row, COLUMNS.group).trim();
        const groupId = groupText ? groupByKey.get(normaliseHeader(groupText)) : null;
        if (groupText && !groupId) {
          fail(`Group type "${groupText}" does not exist.`);
          continue;
        }

        const contentText = pick(row, COLUMNS.content).trim().toUpperCase();
        if (contentText && contentText !== "DOX" && contentText !== "NDOX") {
          fail(`Content must be DOX or NDOX, not "${contentText}".`);
          continue;
        }

        const current = existingByCode.get(code);
        const data = {
          code,
          name,
          productTypeId: typeId ?? null,
          productGroupId: groupId ?? null,
          service: pick(row, COLUMNS.service).trim() || null,
          contentKind: (contentText || current?.contentKind || "NDOX") as "DOX" | "NDOX",
          fuelCharge: parseBoolean(pick(row, COLUMNS.fuelCharge)) ?? current?.fuelCharge ?? true,
          gstReverse: parseBoolean(pick(row, COLUMNS.gstReverse)) ?? current?.gstReverse ?? false,
          isActive: parseBoolean(pick(row, COLUMNS.isActive)) ?? current?.isActive ?? true,
        };

        pending.push({ id: current?.id ?? null, data });
        outcomes.push({ row: rowNumber, status: current ? "update" : "create", code });
      }

      const created = outcomes.filter((outcome) => outcome.status === "create").length;
      const updated = outcomes.filter((outcome) => outcome.status === "update").length;
      const failed = outcomes.filter((outcome) => outcome.status === "error").length;

      // Validation runs over every row before anything is written, and a commit
      // with any failing row writes nothing at all.
      //
      // Partial import is the worst outcome available here: the file is now
      // half-applied, the corrected version re-applies the good rows as
      // updates, and nobody can say afterwards which state the master is in.
      // The preview exists so this is a decision the user makes with the whole
      // picture in front of them.
      if (mode === "commit" && failed > 0) {
        return {
          mode,
          total: outcomes.length,
          created: 0,
          updated: 0,
          failed,
          aborted: true,
          outcomes,
        };
      }

      if (mode === "commit") {
        for (const row of pending) {
          if (row.id) {
            await tx.product.update({ where: { id: row.id }, data: row.data as never });
          } else {
            await tx.product.create({ data: { clientId: clientId!, ...row.data } as never });
          }
        }

        await tx.auditEvent.create({
          data: {
            clientId: clientId!,
            actorId: actor?.userId ?? null,
            action: "masters.product.imported",
            entity: "product",
            metadata: { filename, created, updated, failed, total: outcomes.length },
          },
        });
      }

      return { mode, total: outcomes.length, created, updated, failed, aborted: false, outcomes };
    });
  }
}

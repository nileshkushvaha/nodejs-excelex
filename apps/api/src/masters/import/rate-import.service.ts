import { Injectable } from "@nestjs/common";

import { requireRequestContext } from "../../core/context/request-context";
import { PrismaService } from "../../core/database/prisma.service";
import { parseDate } from "./master-spec";
import { normaliseHeader, parseSpreadsheet, type ImportReport, type RowOutcome } from "./spreadsheet";

/**
 * Rate import, which is not like the others.
 *
 * Every other master is one row per record. A rate file is one row per *line*
 * of a tariff, with the whole key repeated on each — origin, customer, date,
 * vendor, product, service, zone, country, destination — and the lines that
 * share a key are one rate. So this importer groups before it writes, and the
 * unit of success is a group rather than a row.
 *
 * Re-importing a corrected file replaces a rate's lines rather than adding to
 * them. Appending would silently double a tariff, and the second import of a
 * file is the normal way people use this.
 */
const COLUMNS = {
  origin: ["origin"],
  customer: ["customercode", "customer"],
  fromDate: ["fromdate", "from"],
  vendor: ["vendor"],
  product: ["product"],
  service: ["service"],
  zone: ["zone"],
  country: ["country"],
  destination: ["destination"],
  lineType: ["ratetype", "type"],
  weight: ["weight"],
  rate: ["rate"],
  awbCharge: ["awbcharge", "awb"],
  unit: ["unit"],
  days: ["days"],
} as const;

const LINE_TYPES = ["UPTO", "INITIAL", "ADDITIONAL", "PLUS", "PLUSKG"] as const;

function pick(row: Record<string, string>, names: readonly string[]): string {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== "") return value;
  }
  return "";
}

interface Group {
  readonly key: string;
  readonly rowNumbers: number[];
  readonly card: Record<string, unknown>;
  readonly lines: Array<{ lineType: string; weight: string; rate: string }>;
}

@Injectable()
export class RateImportService {
  constructor(private readonly prisma: PrismaService) {}

  /** Their own headings, in their order, so a template matches their export. */
  static readonly TEMPLATE_HEADERS = [
    "ORIGIN", "CUSTOMERCODE", "FROMDATE", "VENDOR", "Product", "Service", "ZONE",
    "COUNTRY", "DESTINATION", "RATETYPE", "WEIGHT", "RATE", "AWBCHARGE", "Unit", "Days",
  ];

  async run(buffer: Buffer, filename: string, mode: "preview" | "commit"): Promise<ImportReport> {
    const { clientId, actor } = requireRequestContext();
    const sheet = await parseSpreadsheet(buffer, filename, 20000);

    return this.prisma.forClient(clientId!, async (tx) => {
      const [customers, destinations, products, zones] = await Promise.all([
        tx.customer.findMany({ where: { deletedAt: null }, select: { id: true, code: true, name: true } }),
        tx.destination.findMany({ where: { deletedAt: null }, select: { id: true, code: true, name: true } }),
        tx.product.findMany({ where: { deletedAt: null }, select: { id: true, code: true, name: true } }),
        tx.zone.findMany({ where: { deletedAt: null }, select: { id: true, code: true, name: true } }),
      ]);

      const index = (rows: Array<{ id: string; code: string; name: string }>) => {
        const map = new Map<string, string>();
        for (const row of rows) {
          map.set(normaliseHeader(row.code), row.id);
          map.set(normaliseHeader(row.name), row.id);
        }
        return map;
      };

      const byCustomer = index(customers);
      const byDestination = index(destinations);
      const byProduct = index(products);
      const byZone = index(zones);

      const outcomes: RowOutcome[] = [];
      const groups = new Map<string, Group>();

      for (const [position, row] of sheet.rows.entries()) {
        // +2 because row 1 is the header and spreadsheets are 1-based.
        const rowNumber = position + 2;
        const fail = (message: string) =>
          outcomes.push({ row: rowNumber, status: "error", code: pick(row, COLUMNS.customer) || "—", message });

        const fromDateText = pick(row, COLUMNS.fromDate);
        const fromDate = parseDate(fromDateText);
        if (!fromDate) {
          fail(`FROMDATE "${fromDateText}" is not a date — use dd-MMM-yyyy, dd/mm/yyyy or yyyy-mm-dd.`);
          continue;
        }

        const lineTypeText = pick(row, COLUMNS.lineType).trim().toUpperCase();
        const lineType = LINE_TYPES.find((candidate) => candidate === lineTypeText);
        if (!lineType) {
          fail(`RATETYPE "${lineTypeText}" must be one of: ${LINE_TYPES.join(", ")}.`);
          continue;
        }

        const weight = pick(row, COLUMNS.weight).trim() || "0";
        const rate = pick(row, COLUMNS.rate).trim() || "0";
        if (!/^\d+(\.\d+)?$/.test(weight)) {
          fail(`WEIGHT "${weight}" is not a number.`);
          continue;
        }
        if (!/^\d+(\.\d+)?$/.test(rate)) {
          fail(`RATE "${rate}" is not a number.`);
          continue;
        }

        // A named reference that does not resolve fails the row rather than
        // creating a rate that prices nothing.
        const lookup = (
          text: string,
          map: Map<string, string>,
          label: string,
        ): string | null | undefined => {
          if (!text.trim()) return null;
          const found = map.get(normaliseHeader(text));
          if (!found) {
            fail(`${label} "${text}" does not exist. Import it first, or correct the spelling.`);
            return undefined;
          }
          return found;
        };

        const customerId = lookup(pick(row, COLUMNS.customer), byCustomer, "CUSTOMERCODE");
        if (customerId === undefined) continue;
        const originId = lookup(pick(row, COLUMNS.origin), byDestination, "ORIGIN");
        if (originId === undefined) continue;
        const destinationId = lookup(pick(row, COLUMNS.destination), byDestination, "DESTINATION");
        if (destinationId === undefined) continue;
        const productId = lookup(pick(row, COLUMNS.product), byProduct, "Product");
        if (productId === undefined) continue;
        const zoneId = lookup(pick(row, COLUMNS.zone), byZone, "ZONE");
        if (zoneId === undefined) continue;

        const unitText = pick(row, COLUMNS.unit).trim().toUpperCase();
        const unit = unitText.startsWith("LB") ? "LBS" : "KGS";
        const daysText = pick(row, COLUMNS.days).trim();
        const awbText = pick(row, COLUMNS.awbCharge).trim();

        const card = {
          customerId,
          originId,
          destinationId,
          productId,
          zoneId,
          vendor: pick(row, COLUMNS.vendor).trim() || null,
          service: pick(row, COLUMNS.service).trim() || null,
          countryCode: pick(row, COLUMNS.country).trim().toUpperCase() || null,
          effectiveFrom: new Date(`${fromDate}T00:00:00Z`),
          unit,
          days: daysText ? Number(daysText) : null,
          awbCharge: awbText || null,
        };

        // The key is every field that identifies a tariff. Rows sharing it are
        // lines of one rate, which is exactly how their file is written.
        const key = JSON.stringify([
          customerId, originId, destinationId, productId, zoneId,
          card.vendor, card.service, card.countryCode, fromDate, unit,
        ]);

        const group: Group = groups.get(key) ?? { key, rowNumbers: [], card, lines: [] };
        group.rowNumbers.push(rowNumber);
        group.lines.push({ lineType, weight, rate });
        groups.set(key, group);
      }

      const failed = outcomes.length;

      // One outcome per rate rather than per row, because a rate is what gets
      // written and what the reader is deciding about.
      const existing = await tx.rateCard.findMany({
        where: { deletedAt: null },
        select: {
          id: true, customerId: true, originId: true, destinationId: true, productId: true,
          zoneId: true, vendor: true, service: true, countryCode: true, effectiveFrom: true, unit: true,
        },
      });

      const existingByKey = new Map(
        existing.map((card) => [
          JSON.stringify([
            card.customerId, card.originId, card.destinationId, card.productId, card.zoneId,
            card.vendor, card.service, card.countryCode,
            card.effectiveFrom.toISOString().slice(0, 10), card.unit,
          ]),
          card.id,
        ]),
      );

      for (const group of groups.values()) {
        const current = existingByKey.get(group.key);
        outcomes.push({
          row: group.rowNumbers[0]!,
          status: current ? "update" : "create",
          code: `${group.lines.length} line(s)`,
        });
      }

      const created = outcomes.filter((outcome) => outcome.status === "create").length;
      const updated = outcomes.filter((outcome) => outcome.status === "update").length;

      if (mode === "commit" && failed > 0) {
        return { mode, total: outcomes.length, created: 0, updated: 0, failed, aborted: true, outcomes };
      }

      if (mode === "commit") {
        for (const group of groups.values()) {
          const current = existingByKey.get(group.key);

          if (current) {
            // Replaced, not appended: a second import of the same file would
            // otherwise silently double every tariff.
            await tx.rateLine.deleteMany({ where: { rateCardId: current } });
            await tx.rateCard.update({ where: { id: current }, data: group.card as never });
            await tx.rateLine.createMany({
              data: group.lines.map((line) => ({ clientId: clientId!, rateCardId: current, ...line })) as never,
            });
            continue;
          }

          const card = await tx.rateCard.create({
            data: { clientId: clientId!, ...group.card } as never,
          });
          await tx.rateLine.createMany({
            data: group.lines.map((line) => ({ clientId: clientId!, rateCardId: card.id, ...line })) as never,
          });
        }

        await tx.auditEvent.create({
          data: {
            clientId: clientId!,
            actorId: actor?.userId ?? null,
            action: "masters.rate.imported",
            entity: "rate_card",
            metadata: { filename, created, updated, failed, lines: sheet.rows.length },
          },
        });
      }

      return { mode, total: outcomes.length, created, updated, failed, aborted: false, outcomes };
    });
  }
}

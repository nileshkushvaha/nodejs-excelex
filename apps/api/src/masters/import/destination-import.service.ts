import { Injectable } from "@nestjs/common";

import { requireRequestContext } from "../../core/context/request-context";
import { PrismaService } from "../../core/database/prisma.service";
import { normaliseHeader, parseSpreadsheet, type ImportReport, type RowOutcome } from "./spreadsheet";

const COLUMNS = {
  code: ["destinationcode", "code"],
  name: ["destinationname", "name"],
  kind: ["type", "kind", "destinationtype"],
  email: ["email", "emailaddress"],
  mobile: ["mobile", "phone", "mobileno", "contact"],
  country: ["country", "countrycode"],
  state: ["state", "statecode"],
  zone: ["zone", "zonecode"],
  serviceType: ["servicetype", "service"],
  mainBranch: ["mainbranch", "branch"],
  manifestBranch: ["branchmanifest", "manifestbranch"],
  isActive: ["status", "active", "isactive"],
} as const;

function pick(row: Record<string, string>, names: readonly string[]): string {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== "") return value;
  }
  return "";
}

function parseBoolean(value: string): boolean | undefined {
  const text = value.trim().toLowerCase();
  if (!text) return undefined;
  if (["y", "yes", "true", "1", "active", "on"].includes(text)) return true;
  if (["n", "no", "false", "0", "inactive", "off"].includes(text)) return false;
  return undefined;
}

/**
 * Spreadsheet import for destinations.
 *
 * The same two-phase contract as products: validate every row, then write only
 * if none failed. This master is the one people actually bulk-load — a few
 * thousand rows migrated out of the old system — so getting a half-applied file
 * here would be the most expensive version of that mistake.
 *
 * Branch references are resolved in two passes, because a file almost always
 * lists a destination before the branch it reports to, and requiring the file to
 * be topologically sorted would make it unusable.
 */
@Injectable()
export class DestinationImportService {
  constructor(private readonly prisma: PrismaService) {}

  static readonly TEMPLATE_HEADERS = [
    "Destination Code",
    "Destination Name",
    "Type",
    "Email",
    "Mobile",
    "Country",
    "State",
    "Zone",
    "Service Type",
    "Main Branch",
    "Branch Manifest",
    "Status",
  ];

  async run(buffer: Buffer, filename: string, mode: "preview" | "commit"): Promise<ImportReport> {
    const { clientId, actor } = requireRequestContext();
    const sheet = await parseSpreadsheet(buffer, filename);

    return this.prisma.forClient(clientId!, async (tx) => {
      const [zones, existing, states] = await Promise.all([
        tx.zone.findMany({ where: { deletedAt: null } }),
        tx.destination.findMany({ where: { deletedAt: null } }),
        tx.$queryRaw<Array<{ code: string }>>`SELECT code FROM public.list_states('IN')`,
      ]);

      const zoneByKey = new Map<string, string>();
      for (const zone of zones) {
        zoneByKey.set(normaliseHeader(zone.code), zone.id);
        zoneByKey.set(normaliseHeader(zone.name), zone.id);
      }

      const stateCodes = new Set(states.map((state) => state.code.toUpperCase()));
      const existingByCode = new Map(existing.map((row) => [row.code, row]));

      // Codes that will exist once this file is applied — the file's own rows
      // plus what is already stored. A branch reference is valid against this
      // set rather than only against the database, so forward references work.
      const codesAfterImport = new Set(existingByCode.keys());
      for (const row of sheet.rows) {
        const code = pick(row, COLUMNS.code).trim().toUpperCase();
        if (code) codesAfterImport.add(code);
      }

      const outcomes: RowOutcome[] = [];
      const seenInFile = new Set<string>();
      const pending: Array<{
        code: string;
        id: string | null;
        data: Record<string, unknown>;
        mainBranchCode: string | null;
        manifestBranchCode: string | null;
      }> = [];

      for (const [index, row] of sheet.rows.entries()) {
        const rowNumber = index + 2;
        const code = pick(row, COLUMNS.code).trim().toUpperCase();
        const name = pick(row, COLUMNS.name).trim();

        const fail = (message: string) =>
          outcomes.push({ row: rowNumber, status: "error", code: code || "—", message });

        if (!code) {
          fail("Destination code is missing.");
          continue;
        }
        if (!/^[A-Z0-9-]{2,20}$/.test(code)) {
          fail(`"${code}" is not a valid code — letters, numbers and hyphens, 2 to 20 characters.`);
          continue;
        }
        if (!name) {
          fail("Destination name is missing.");
          continue;
        }
        if (seenInFile.has(code)) {
          fail(`"${code}" appears more than once in this file.`);
          continue;
        }
        seenInFile.add(code);

        const kindText = pick(row, COLUMNS.kind).trim().toUpperCase();
        const kind =
          !kindText || kindText.startsWith("DOM")
            ? "DOMESTIC"
            : kindText.startsWith("INT")
              ? "INTERNATIONAL"
              : null;
        if (!kind) {
          fail(`Type must be Domestic or International, not "${kindText}".`);
          continue;
        }

        const serviceText = pick(row, COLUMNS.serviceType).trim().toUpperCase();
        const serviceType = !serviceText
          ? "REGULAR"
          : (["REGULAR", "METRO", "REMOTE"] as const).find((type) => type === serviceText);
        if (!serviceType) {
          fail(`Service type must be Regular, Metro or Remote, not "${serviceText}".`);
          continue;
        }

        const countryCode = (pick(row, COLUMNS.country).trim() || "IN").toUpperCase();
        const stateCode = pick(row, COLUMNS.state).trim().toUpperCase() || null;
        if (stateCode && countryCode === "IN" && !stateCodes.has(stateCode)) {
          fail(`"${stateCode}" is not an Indian state or union territory code.`);
          continue;
        }

        const zoneText = pick(row, COLUMNS.zone).trim();
        const zoneId = zoneText ? zoneByKey.get(normaliseHeader(zoneText)) : null;
        if (zoneText && !zoneId) {
          fail(`Zone "${zoneText}" does not exist. Create it first, or correct the spelling.`);
          continue;
        }

        const mainBranchCode = pick(row, COLUMNS.mainBranch).trim().toUpperCase() || null;
        const manifestBranchCode = pick(row, COLUMNS.manifestBranch).trim().toUpperCase() || null;

        for (const [branchCode, label] of [
          [mainBranchCode, "Main branch"],
          [manifestBranchCode, "Branch manifest"],
        ] as const) {
          if (!branchCode) continue;
          if (branchCode === code) {
            fail(`${label} cannot be the destination itself.`);
            break;
          }
          if (!codesAfterImport.has(branchCode)) {
            fail(`${label} "${branchCode}" is not in this file and does not already exist.`);
            break;
          }
        }
        if (outcomes.at(-1)?.row === rowNumber && outcomes.at(-1)?.status === "error") continue;

        const current = existingByCode.get(code);

        pending.push({
          code,
          id: current?.id ?? null,
          mainBranchCode,
          manifestBranchCode,
          data: {
            kind,
            code,
            name,
            email: pick(row, COLUMNS.email).trim() || null,
            mobile: pick(row, COLUMNS.mobile).trim() || null,
            countryCode,
            stateCode,
            zoneId: zoneId ?? null,
            serviceType,
            isActive: parseBoolean(pick(row, COLUMNS.isActive)) ?? current?.isActive ?? true,
          },
        });

        outcomes.push({ row: rowNumber, status: current ? "update" : "create", code });
      }

      const created = outcomes.filter((outcome) => outcome.status === "create").length;
      const updated = outcomes.filter((outcome) => outcome.status === "update").length;
      const failed = outcomes.filter((outcome) => outcome.status === "error").length;

      if (mode === "preview" || failed > 0) {
        return {
          mode,
          total: outcomes.length,
          created: mode === "commit" ? 0 : created,
          updated: mode === "commit" ? 0 : updated,
          failed,
          aborted: mode === "commit" && failed > 0,
          outcomes,
        };
      }

      // Pass one writes the rows without their branch links, pass two fills
      // them in — by then every code in the file exists and can be resolved.
      const idByCode = new Map<string, string>(
        [...existingByCode.entries()].map(([key, row]) => [key, row.id]),
      );

      for (const row of pending) {
        if (row.id) {
          await tx.destination.update({ where: { id: row.id }, data: row.data as never });
        } else {
          const written = await tx.destination.create({
            data: { clientId: clientId!, ...row.data } as never,
          });
          idByCode.set(row.code, written.id);
        }
      }

      for (const row of pending) {
        const id = row.id ?? idByCode.get(row.code);
        if (!id) continue;

        await tx.destination.update({
          where: { id },
          data: {
            mainBranchId: row.mainBranchCode ? (idByCode.get(row.mainBranchCode) ?? null) : null,
            manifestBranchId: row.manifestBranchCode
              ? (idByCode.get(row.manifestBranchCode) ?? null)
              : null,
          },
        });
      }

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.destination.imported",
          entity: "destination",
          metadata: { filename, created, updated, total: outcomes.length },
        },
      });

      return { mode, total: outcomes.length, created, updated, failed: 0, aborted: false, outcomes };
    });
  }
}

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

import { requireRequestContext } from "../../core/context/request-context";
import { PrismaService } from "../../core/database/prisma.service";
import {
  acceptedNames,
  headersOf,
  type MasterSpec,
  type ReadContext,
} from "./master-spec";
import { normaliseHeader, parseSpreadsheet, type ImportReport, type RowOutcome } from "./spreadsheet";
import { buildWorkbook } from "./workbook";

/**
 * Import and export, for any master that has a spec.
 *
 * The rules are the ones the hand-written importers arrived at, kept in one
 * place so they hold everywhere rather than wherever they were remembered:
 *
 *   - Preview writes nothing and reports what would change, per row.
 *   - A commit with any failing row writes nothing at all. Partial import is
 *     the worst outcome available — the master is half-applied, the corrected
 *     file re-applies the good rows as updates, and afterwards nobody can say
 *     what state it is in.
 *   - Import is an upsert by code, because re-importing a corrected file is
 *     how people actually use this, and failing on duplicates would mean
 *     deleting everything first.
 *   - A code appearing twice in one file fails before the write, rather than
 *     at the database, which would see only the second row and report a
 *     constraint violation with no line number to fix.
 */
@Injectable()
export class MasterIoService {
  constructor(private readonly prisma: PrismaService) {}

  /** The rows an export writes, with whatever relations its columns need. */
  async rows(spec: MasterSpec): Promise<Record<string, unknown>[]> {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const delegate = this.delegate(tx, spec);
      return delegate.findMany({
        where: { deletedAt: null, ...(spec.scope ?? {}) },
        ...(spec.include ? { include: spec.include } : {}),
        orderBy: { code: "asc" },
        // Past this, the honest answer is a report rather than a file the
        // browser has to hold and Excel has to open.
        take: 20000,
      }) as Promise<Record<string, unknown>[]>;
    });
  }

  async exportWorkbook(spec: MasterSpec): Promise<Buffer> {
    const rows = await this.rows(spec);

    return buildWorkbook(
      spec.label.many,
      headersOf(spec),
      rows.map((row) => spec.columns.map((column) => column.write(row))),
    );
  }

  async templateWorkbook(spec: MasterSpec): Promise<Buffer> {
    const headers = headersOf(spec);
    // An example row when the spec has one. Without it the template is a row
    // of headings and a guess at what each wants.
    const rows = spec.example ? [spec.example] : [];
    return buildWorkbook(spec.label.many, headers, rows);
  }

  async run(
    spec: MasterSpec,
    buffer: Buffer,
    filename: string,
    mode: "preview" | "commit",
  ): Promise<ImportReport> {
    if (spec.importable === false) {
      throw new BadRequestException(`${spec.label.many} cannot be imported.`);
    }

    const { clientId, actor } = requireRequestContext();
    const sheet = await parseSpreadsheet(buffer, filename);

    // The first column is the code, by convention: it is what an upsert keys
    // on and what an error message names.
    const codeColumn = spec.columns[0];
    if (!codeColumn) throw new BadRequestException("That master has no columns defined.");

    return this.prisma.forClient(clientId!, async (tx) => {
      // Referenced masters, loaded once rather than per row. Code and name
      // both resolve, so either spelling in the file lands on the same row.
      const lookups = new Map<string, Map<string, string>>();
      for (const spec_ of spec.lookups ?? []) {
        const rows = (await this.delegate(tx, { model: spec_.model } as MasterSpec).findMany({
          where: { deletedAt: null },
          select: { id: true, code: true, name: true },
        })) as Array<{ id: string; code: string | null; name: string | null }>;

        const index = new Map<string, string>();
        for (const row of rows) {
          if (row.code) index.set(normaliseHeader(row.code), row.id);
          if (row.name) index.set(normaliseHeader(row.name), row.id);
        }
        lookups.set(spec_.name, index);
      }

      const context: ReadContext = {
        lookup: (name, text) => lookups.get(name)?.get(normaliseHeader(text)),
      };

      const delegate = this.delegate(tx, spec);
      // Scoped, so an industry called ADM does not collide with a vendor
      // called ADM when the two share a table.
      const existing = (await delegate.findMany({
        where: { deletedAt: null, ...(spec.scope ?? {}) },
      })) as Array<{ id: string; code: string }>;
      const existingByCode = new Map(existing.map((row) => [row.code, row]));

      const seenInFile = new Set<string>();
      const outcomes: RowOutcome[] = [];
      const pending: Array<{ id: string | null; data: Record<string, unknown> }> = [];

      for (const [index, row] of sheet.rows.entries()) {
        // +2 because row 1 is the header and spreadsheets are 1-based, so
        // this is the number in Excel's own gutter.
        const rowNumber = index + 2;
        const data: Record<string, unknown> = {};
        let failure: string | undefined;

        for (const column of spec.columns) {
          if (!column.read) continue;

          const value = pick(row, acceptedNames(column));
          if (!value.trim()) {
            if (column.required) {
              failure = `${column.header} is missing.`;
              break;
            }
            continue;
          }

          const message = column.read(value, data, context);
          if (message) {
            failure = `${column.header}: ${message}`;
            break;
          }
        }

        const code = String(data["code"] ?? "").trim();

        if (!failure && !code) failure = `${codeColumn.header} is missing.`;
        if (!failure && seenInFile.has(code)) {
          failure = `"${code}" appears more than once in this file.`;
        }

        if (failure) {
          outcomes.push({ row: rowNumber, status: "error", code: code || "—", message: failure });
          continue;
        }

        seenInFile.add(code);
        const current = existingByCode.get(code);
        pending.push({ id: current?.id ?? null, data });
        outcomes.push({ row: rowNumber, status: current ? "update" : "create", code });
      }

      const created = outcomes.filter((outcome) => outcome.status === "create").length;
      const updated = outcomes.filter((outcome) => outcome.status === "update").length;
      const failed = outcomes.filter((outcome) => outcome.status === "error").length;

      if (mode === "commit" && failed > 0) {
        return { mode, total: outcomes.length, created: 0, updated: 0, failed, aborted: true, outcomes };
      }

      if (mode === "commit") {
        for (const row of pending) {
          if (row.id) {
            await delegate.update({ where: { id: row.id }, data: row.data });
          } else {
            await delegate.create({ data: { clientId: clientId!, ...(spec.scope ?? {}), ...row.data } });
          }
        }

        await tx.auditEvent.create({
          data: {
            clientId: clientId!,
            actorId: actor?.userId ?? null,
            action: `masters.${spec.key}.imported`,
            entity: spec.key,
            metadata: { filename, created, updated, failed, total: outcomes.length },
          },
        });
      }

      return { mode, total: outcomes.length, created, updated, failed, aborted: false, outcomes };
    });
  }

  /**
   * The Prisma delegate named by the spec.
   *
   * Typed loosely on purpose: the whole point is one code path over a dozen
   * models, and Prisma's per-model types cannot be unified without a generic
   * that would have to be threaded through every caller to say nothing new.
   * The spec's model name is checked here, once, so a typo fails loudly
   * rather than as "cannot read property findMany of undefined".
   */
  private delegate(tx: unknown, spec: Pick<MasterSpec, "model">) {
    const delegate = (tx as Record<string, unknown>)[spec.model] as
      | {
          findMany: (args: unknown) => Promise<unknown>;
          update: (args: unknown) => Promise<unknown>;
          create: (args: unknown) => Promise<unknown>;
        }
      | undefined;

    if (!delegate?.findMany) {
      throw new NotFoundException(`No model named "${spec.model}".`);
    }
    return delegate;
  }
}

function pick(row: Record<string, string>, names: readonly string[]): string {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== "") return value;
  }
  return "";
}

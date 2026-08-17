import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { requireRequestContext } from "../core/context/request-context";
import { PrismaService } from "../core/database/prisma.service";

/** The slice of the transaction client this service needs. */
interface TransactionLike {
  zone: { findFirst: (args: unknown) => Promise<unknown> };
  destination: { findFirst: (args: unknown) => Promise<unknown> };
  $queryRaw: <T>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
}

export type DestinationKind = "DOMESTIC" | "INTERNATIONAL";
export type ServiceType = "REGULAR" | "METRO" | "REMOTE";

export interface DestinationView {
  id: string;
  kind: DestinationKind;
  code: string;
  name: string;
  email: string | null;
  mobile: string | null;
  countryCode: string;
  stateCode: string | null;
  serviceType: ServiceType;
  isActive: boolean;
  zone: { id: string; code: string; name: string } | null;
  mainBranch: { id: string; code: string; name: string } | null;
  manifestBranch: { id: string; code: string; name: string } | null;
}

export interface DestinationQuery {
  kind?: DestinationKind;
  page: number;
  pageSize: number;
  sort: "code" | "name" | "stateCode" | "serviceType" | "isActive";
  direction: "asc" | "desc";
  /** Per-column contains-filters, as the legacy grid offers. */
  code?: string;
  name?: string;
  countryCode?: string;
  stateCode?: string;
  serviceType?: string;
  status?: string;
  /** One box across code and name, for the toolbar search. */
  search?: string;
}

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface DestinationInput {
  kind: DestinationKind;
  code: string;
  name: string;
  email: string | null;
  mobile: string | null;
  countryCode: string;
  stateCode: string | null;
  zoneId: string | null;
  serviceType: ServiceType;
  mainBranchId: string | null;
  manifestBranchId: string | null;
  isActive: boolean;
}

/**
 * Destinations — the first master with real volume.
 *
 * A live client carries a few thousand, so paging, sorting and filtering all
 * happen in the database. The earlier masters load in full and filter in the
 * browser, which is right for 249 countries and wrong here: shipping four
 * thousand rows to filter five of them wastes the trip, and the browser cannot
 * count what it was not sent.
 */
@Injectable()
export class DestinationService {
  constructor(private readonly prisma: PrismaService) {}

  /** Bounded so a caller cannot ask for the whole master in one request. */
  static readonly MAX_PAGE_SIZE = 200;

  async list(query: DestinationQuery): Promise<Page<DestinationView>> {
    const { clientId } = requireRequestContext();

    // Typed locally rather than as Prisma.DestinationWhereInput: this app
    // reaches the database only through @excelex/database and does not depend
    // on the generated client.
    const where: Record<string, unknown> = { deletedAt: null };
    if (query.kind) where.kind = query.kind;

    // `mode: "insensitive"` rather than lowercasing the column in a raw filter,
    // so the query stays a Prisma query and the extension still injects the
    // client barrier.
    const contains = (value: string | undefined) =>
      value?.trim() ? { contains: value.trim(), mode: "insensitive" as const } : undefined;

    if (contains(query.code)) where.code = contains(query.code);
    if (contains(query.name)) where.name = contains(query.name);
    if (contains(query.countryCode)) where.countryCode = contains(query.countryCode);
    if (contains(query.stateCode)) where.stateCode = contains(query.stateCode);

    if (query.serviceType?.trim()) {
      const wanted = ["REGULAR", "METRO", "REMOTE"].filter((type) =>
        type.startsWith(query.serviceType!.trim().toUpperCase()),
      );
      // An unmatchable filter must return nothing rather than everything.
      where.serviceType = { in: wanted.length > 0 ? (wanted as ServiceType[]) : [] };
    }

    if (query.status?.trim()) {
      const text = query.status.trim().toLowerCase();
      if ("active".startsWith(text)) where.isActive = true;
      else if ("inactive".startsWith(text)) where.isActive = false;
      else where.id = "00000000-0000-4000-8000-000000000000";
    }

    if (query.search?.trim()) {
      const text = query.search.trim();
      where.OR = [
        { code: { contains: text, mode: "insensitive" } },
        { name: { contains: text, mode: "insensitive" } },
      ];
    }

    const pageSize = Math.min(Math.max(query.pageSize, 1), DestinationService.MAX_PAGE_SIZE);

    return this.prisma.forClient(clientId!, async (tx) => {
      // Counted in the same transaction as the page, so the total and the rows
      // describe the same instant. Two round trips would let a concurrent
      // import move a row between them and produce a page that does not add up.
      const total = await tx.destination.count({ where: where as never });
      const pageCount = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.min(Math.max(query.page, 1), pageCount);

      const rows = await tx.destination.findMany({
        where: where as never,
        include: { zone: true, mainBranch: true, manifestBranch: true },
        // Code is the tiebreak on every sort: without a total order, two rows
        // with equal sort keys can swap between pages and one of them is never
        // seen.
        orderBy:
          query.sort === "code"
            ? [{ code: query.direction }]
            : [{ [query.sort]: query.direction }, { code: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      });

      return { rows: rows.map(toView), total, page, pageSize, pageCount };
    });
  }

  /**
   * One destination by id.
   *
   * The edit page previously found its row inside the full options list, which
   * is fine at four rows and wrong at four thousand: rendering one record
   * should not read the whole master.
   */
  async byId(id: string): Promise<DestinationView | null> {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const row = await tx.destination.findFirst({
        where: { id, deletedAt: null },
        include: { zone: true, mainBranch: true, manifestBranch: true },
      });
      return row ? toView(row) : null;
    });
  }

  /** Every destination, for the self-referencing branch pickers and for export. */
  async listAll(kind?: DestinationKind): Promise<DestinationView[]> {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const rows = await tx.destination.findMany({
        where: { deletedAt: null, ...(kind ? { kind } : {}) },
        include: { zone: true, mainBranch: true, manifestBranch: true },
        orderBy: { code: "asc" },
      });
      return rows.map(toView);
    });
  }

  async create(input: DestinationInput): Promise<{ id: string }> {
    const { clientId, actor } = requireRequestContext();
    const code = input.code.trim().toUpperCase();

    return this.prisma.forClient(clientId!, async (tx) => {
      const clash = await tx.destination.findFirst({ where: { code, deletedAt: null } });
      if (clash) throw new BadRequestException(`A destination with code "${code}" already exists.`);

      await this.assertReferences(tx, input, null);

      const row = await tx.destination.create({
        data: { clientId: clientId!, ...input, code },
      });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.destination.created",
          entity: "destination",
          entityId: row.id,
          metadata: { code, name: input.name },
        },
      });

      return { id: row.id };
    });
  }

  async update(id: string, input: DestinationInput): Promise<void> {
    const { clientId, actor } = requireRequestContext();
    const code = input.code.trim().toUpperCase();

    await this.prisma.forClient(clientId!, async (tx) => {
      const before = await tx.destination.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException("Destination not found.");

      const clash = await tx.destination.findFirst({
        where: { code, deletedAt: null, NOT: { id } },
      });
      if (clash) throw new BadRequestException("Another destination already uses that code.");

      await this.assertReferences(tx, input, id);

      await tx.destination.update({ where: { id }, data: { ...input, code } });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.destination.updated",
          entity: "destination",
          entityId: id,
          metadata: {
            from: { code: before.code, name: before.name, serviceType: before.serviceType },
            to: { code, name: input.name, serviceType: input.serviceType },
          },
        },
      });
    });
  }

  async remove(id: string): Promise<void> {
    const { clientId, actor } = requireRequestContext();

    await this.prisma.forClient(clientId!, async (tx) => {
      const row = await tx.destination.findFirst({ where: { id, deletedAt: null } });
      if (!row) throw new NotFoundException("Destination not found.");

      // Refused rather than cascaded: removing a servicing branch would orphan
      // the destinations that report to it, and they would keep quoting a
      // branch that no longer exists.
      const dependents = await tx.destination.count({
        where: { deletedAt: null, OR: [{ mainBranchId: id }, { manifestBranchId: id }] },
      });
      if (dependents > 0) {
        throw new BadRequestException(
          `${dependents} destination(s) use this one as their main or manifest branch. Reassign them first.`,
        );
      }

      await tx.destination.update({ where: { id }, data: { deletedAt: new Date() } });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.destination.deleted",
          entity: "destination",
          entityId: id,
          metadata: { code: row.code, name: row.name },
        },
      });
    });
  }

  /**
   * Validates the things a foreign key alone would report unreadably.
   *
   * The composite keys already make a cross-client reference impossible; what
   * they cannot do is say "that zone does not exist" instead of raising a
   * constraint violation nobody outside the database can interpret.
   */
  private async assertReferences(
    tx: TransactionLike,
    input: DestinationInput,
    selfId: string | null,
  ): Promise<void> {
    if (input.zoneId) {
      const zone = await tx.zone.findFirst({ where: { id: input.zoneId, deletedAt: null } });
      if (!zone) throw new BadRequestException("That zone does not exist.");
    }

    for (const [field, label] of [
      ["mainBranchId", "main branch"],
      ["manifestBranchId", "manifest branch"],
    ] as const) {
      const value = input[field];
      if (!value) continue;

      if (selfId && value === selfId) {
        throw new BadRequestException(`A destination cannot be its own ${label}.`);
      }

      const branch = await tx.destination.findFirst({ where: { id: value, deletedAt: null } });
      if (!branch) throw new BadRequestException(`That ${label} does not exist.`);
    }

    if (input.stateCode) {
      const states = await tx.$queryRaw<Array<{ code: string }>>`
        SELECT code FROM public.list_states(${input.countryCode})
      `;
      if (!states.some((state: { code: string }) => state.code === input.stateCode)) {
        throw new BadRequestException(
          `"${input.stateCode}" is not a subdivision of ${input.countryCode}.`,
        );
      }
    }
  }
}

function toView(row: {
  id: string;
  kind: string;
  code: string;
  name: string;
  email: string | null;
  mobile: string | null;
  countryCode: string;
  stateCode: string | null;
  serviceType: string;
  isActive: boolean;
  zone: { id: string; code: string; name: string } | null;
  mainBranch: { id: string; code: string; name: string } | null;
  manifestBranch: { id: string; code: string; name: string } | null;
}): DestinationView {
  const brief = (value: { id: string; code: string; name: string } | null) =>
    value ? { id: value.id, code: value.code, name: value.name } : null;

  return {
    id: row.id,
    kind: row.kind as DestinationKind,
    code: row.code,
    name: row.name,
    email: row.email,
    mobile: row.mobile,
    countryCode: row.countryCode,
    stateCode: row.stateCode,
    serviceType: row.serviceType as ServiceType,
    isActive: row.isActive,
    zone: brief(row.zone),
    mainBranch: brief(row.mainBranch),
    manifestBranch: brief(row.manifestBranch),
  };
}

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@excelex/database";

import { requireRequestContext } from "../core/context/request-context";
import { PrismaService } from "../core/database/prisma.service";
import { paginate, type PageRequest } from "./paged";

export interface PinCodeInput {
  code: string;
  city: string | null;
  area: string | null;
  stateCode: string | null;
  countryCode: string;
  destinationId: string | null;
  zoneId: string | null;
  oda: boolean;
  isActive: boolean;
}

export interface PinCodeListQuery extends PageRequest {
  search?: string;
  destinationId?: string;
  zoneId?: string;
  status?: string;
}

/**
 * Pin codes — the join between an address and the network.
 *
 * Paged, because India has about 19,000 of them and a client that imports the
 * lot would otherwise send all of them to a browser showing twenty. This is
 * also the master the booking screen will query on every keystroke, which is
 * why it is the one with a code index rather than a generated search column:
 * a pin code is looked up by prefix, not by fuzzy match.
 */
@Injectable()
export class PinCodeService {
  constructor(private readonly prisma: PrismaService) {}

  private where(query: Omit<PinCodeListQuery, "page" | "pageSize">): Prisma.PinCodeWhereInput {
    const search = query.search?.trim();

    return {
      deletedAt: null,
      ...(query.destinationId ? { destinationId: query.destinationId } : {}),
      ...(query.zoneId ? { zoneId: query.zoneId } : {}),
      ...(query.status ? { isActive: query.status === "active" } : {}),
      ...(search
        ? {
            OR: [
              // Prefix rather than contains: nobody searches for the middle of
              // a pin code, and a prefix can use the plain index.
              { code: { startsWith: search } },
              { city: { contains: search, mode: "insensitive" as const } },
              { area: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
  }

  async list(query: PinCodeListQuery) {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) =>
      paginate(
        tx.pinCode,
        {
          where: this.where(query),
          include: { destination: true, zone: true },
          orderBy: [{ code: "asc" }],
          request: { page: query.page, pageSize: query.pageSize },
        },
        serialise,
      ),
    );
  }

  async byId(id: string) {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const row = await tx.pinCode.findFirst({
        where: { id, deletedAt: null },
        include: { destination: true, zone: true },
      });
      return row ? serialise(row) : null;
    });
  }

  async create(input: PinCodeInput): Promise<{ id: string }> {
    const { clientId, actor } = requireRequestContext();
    const code = input.code.trim();

    return this.prisma.forClient(clientId!, async (tx) => {
      const clash = await tx.pinCode.findFirst({ where: { code, deletedAt: null } });
      if (clash) throw new BadRequestException(`Pin code "${code}" already exists.`);

      const row = await tx.pinCode.create({ data: { clientId: clientId!, ...toData(input), code } });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.pin_code.created",
          entity: "pin_code",
          entityId: row.id,
          metadata: { code, city: input.city },
        },
      });

      return { id: row.id };
    });
  }

  async update(id: string, input: PinCodeInput): Promise<void> {
    const { clientId, actor } = requireRequestContext();
    const code = input.code.trim();

    await this.prisma.forClient(clientId!, async (tx) => {
      const before = await tx.pinCode.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException("Pin code not found.");

      const clash = await tx.pinCode.findFirst({ where: { code, deletedAt: null, NOT: { id } } });
      if (clash) throw new BadRequestException("Another row already uses that pin code.");

      await tx.pinCode.update({ where: { id }, data: { ...toData(input), code } });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.pin_code.updated",
          entity: "pin_code",
          entityId: id,
          metadata: { from: before.code, to: code },
        },
      });
    });
  }

  async remove(id: string): Promise<void> {
    const { clientId, actor } = requireRequestContext();

    await this.prisma.forClient(clientId!, async (tx) => {
      const row = await tx.pinCode.findFirst({ where: { id, deletedAt: null } });
      if (!row) throw new NotFoundException("Pin code not found.");

      await tx.pinCode.update({ where: { id }, data: { deletedAt: new Date() } });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.pin_code.deleted",
          entity: "pin_code",
          entityId: id,
          metadata: { code: row.code },
        },
      });
    });
  }
}

function toData(input: PinCodeInput) {
  return {
    city: input.city,
    area: input.area,
    stateCode: input.stateCode,
    countryCode: input.countryCode,
    destinationId: input.destinationId,
    zoneId: input.zoneId,
    oda: input.oda,
    isActive: input.isActive,
  };
}

type Row = Prisma.PinCodeGetPayload<{ include: { destination: true; zone: true } }>;

function serialise(row: Row) {
  return {
    id: row.id,
    code: row.code,
    city: row.city,
    area: row.area,
    stateCode: row.stateCode,
    countryCode: row.countryCode,
    oda: row.oda,
    isActive: row.isActive,
    destination: row.destination
      ? { id: row.destination.id, code: row.destination.code, name: row.destination.name }
      : null,
    zone: row.zone ? { id: row.zone.id, code: row.zone.code, name: row.zone.name } : null,
  };
}

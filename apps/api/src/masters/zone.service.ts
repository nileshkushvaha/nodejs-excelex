import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

import { requireRequestContext } from "../core/context/request-context";
import { PrismaService } from "../core/database/prisma.service";

export interface ZoneView {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface ZoneInput {
  code: string;
  name: string;
  isActive: boolean;
}

/**
 * Rating zones. Deliberately thin — code and name only.
 *
 * What makes a zone useful is what points at it: destinations, pincodes and
 * rate cards. Those arrive with their own modules, and adding speculative
 * columns now would mean guessing at their shape.
 */
@Injectable()
export class ZoneService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<ZoneView[]> {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const rows = await tx.zone.findMany({
        where: { deletedAt: null },
        orderBy: { code: "asc" },
      });
      return rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        isActive: row.isActive,
      }));
    });
  }

  async create(input: ZoneInput): Promise<{ id: string }> {
    const { clientId, actor } = requireRequestContext();
    const code = input.code.trim().toUpperCase();

    return this.prisma.forClient(clientId!, async (tx) => {
      const clash = await tx.zone.findFirst({ where: { code, deletedAt: null } });
      if (clash) throw new BadRequestException(`A zone with code "${code}" already exists.`);

      const row = await tx.zone.create({
        data: { clientId: clientId!, code, name: input.name, isActive: input.isActive },
      });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.zone.created",
          entity: "zone",
          entityId: row.id,
          metadata: { code, name: input.name },
        },
      });

      return { id: row.id };
    });
  }

  async update(id: string, input: ZoneInput): Promise<void> {
    const { clientId, actor } = requireRequestContext();
    const code = input.code.trim().toUpperCase();

    await this.prisma.forClient(clientId!, async (tx) => {
      const before = await tx.zone.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException("Zone not found.");

      const clash = await tx.zone.findFirst({ where: { code, deletedAt: null, NOT: { id } } });
      if (clash) throw new BadRequestException("Another zone already uses that code.");

      await tx.zone.update({
        where: { id },
        data: { code, name: input.name, isActive: input.isActive },
      });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.zone.updated",
          entity: "zone",
          entityId: id,
          metadata: { from: { code: before.code, name: before.name }, to: { code, name: input.name } },
        },
      });
    });
  }

  async remove(id: string): Promise<void> {
    const { clientId, actor } = requireRequestContext();

    await this.prisma.forClient(clientId!, async (tx) => {
      const row = await tx.zone.findFirst({ where: { id, deletedAt: null } });
      if (!row) throw new NotFoundException("Zone not found.");

      await tx.zone.update({ where: { id }, data: { deletedAt: new Date() } });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.zone.deleted",
          entity: "zone",
          entityId: id,
          metadata: { code: row.code, name: row.name },
        },
      });
    });
  }
}

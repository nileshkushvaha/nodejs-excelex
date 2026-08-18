import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

import { requireRequestContext } from "../core/context/request-context";
import { PrismaService } from "../core/database/prisma.service";

/** The six lists that are a code, a name and a switch. */
export const LOOKUP_KINDS = {
  vendors: "VENDOR",
  industries: "INDUSTRY",
  areas: "AREA",
  "content-types": "CONTENT_TYPE",
  instructions: "INSTRUCTION",
  "customer-groups": "CUSTOMER_GROUP",
} as const;

export type LookupSlug = keyof typeof LOOKUP_KINDS;

export interface LookupInput {
  code: string;
  name: string;
  description: string | null;
  sequence: number;
  isActive: boolean;
}

/**
 * One service for six masters.
 *
 * Vendors, industries, areas, content types, instructions and customer groups
 * differ only in what they are called. Six services would be six copies of
 * this file with one word changed, and the parser bug fixed in one would stay
 * in the other five — which is the shape of duplication the audit found in the
 * consignee and shipper pair.
 *
 * A lookup graduates to its own table the moment it grows a field the others
 * do not have. Product type and zone both did; that is why they are not here.
 */
@Injectable()
export class LookupService {
  constructor(private readonly prisma: PrismaService) {}

  async list(kind: string) {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const rows = await tx.lookup.findMany({
        where: { kind: kind as never, deletedAt: null },
        // Sequence is where the client wants it in a dropdown; code breaks
        // ties so a list left at zero still has a stable order.
        orderBy: [{ sequence: "asc" }, { code: "asc" }],
      });

      return rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        description: row.description,
        sequence: row.sequence,
        isActive: row.isActive,
      }));
    });
  }

  async create(kind: string, input: LookupInput): Promise<{ id: string }> {
    const { clientId, actor } = requireRequestContext();
    const code = input.code.trim().toUpperCase();

    return this.prisma.forClient(clientId!, async (tx) => {
      // Scoped by kind: a vendor and an industry may share a code, and the
      // partial unique index says the same thing.
      const clash = await tx.lookup.findFirst({
        where: { kind: kind as never, code, deletedAt: null },
      });
      if (clash) throw new BadRequestException(`"${code}" is already used in this list.`);

      const row = await tx.lookup.create({
        data: {
          clientId: clientId!,
          kind: kind as never,
          code,
          name: input.name.trim(),
          description: input.description,
          sequence: input.sequence,
          isActive: input.isActive,
        },
      });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.lookup.created",
          entity: "lookup",
          entityId: row.id,
          metadata: { kind, code, name: input.name },
        },
      });

      return { id: row.id };
    });
  }

  async update(kind: string, id: string, input: LookupInput): Promise<void> {
    const { clientId, actor } = requireRequestContext();
    const code = input.code.trim().toUpperCase();

    await this.prisma.forClient(clientId!, async (tx) => {
      // Matched on kind as well as id, so a crafted request cannot edit a
      // vendor through the industries screen.
      const before = await tx.lookup.findFirst({
        where: { id, kind: kind as never, deletedAt: null },
      });
      if (!before) throw new NotFoundException("That row no longer exists.");

      const clash = await tx.lookup.findFirst({
        where: { kind: kind as never, code, deletedAt: null, NOT: { id } },
      });
      if (clash) throw new BadRequestException(`"${code}" is already used in this list.`);

      await tx.lookup.update({
        where: { id },
        data: {
          code,
          name: input.name.trim(),
          description: input.description,
          sequence: input.sequence,
          isActive: input.isActive,
        },
      });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.lookup.updated",
          entity: "lookup",
          entityId: id,
          metadata: { kind, from: before.code, to: code },
        },
      });
    });
  }

  async remove(kind: string, id: string): Promise<void> {
    const { clientId, actor } = requireRequestContext();

    await this.prisma.forClient(clientId!, async (tx) => {
      const row = await tx.lookup.findFirst({
        where: { id, kind: kind as never, deletedAt: null },
      });
      if (!row) throw new NotFoundException("That row no longer exists.");

      await tx.lookup.update({ where: { id }, data: { deletedAt: new Date() } });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.lookup.deleted",
          entity: "lookup",
          entityId: id,
          metadata: { kind, code: row.code, name: row.name },
        },
      });
    });
  }
}

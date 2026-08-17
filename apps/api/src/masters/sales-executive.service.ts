import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

import { requireRequestContext } from "../core/context/request-context";
import { PrismaService } from "../core/database/prisma.service";

export interface SalesExecutiveView {
  id: string;
  code: string;
  name: string;
  /**
   * Sent as a string, not a number.
   *
   * The column is exact decimal because it multiplies invoice amounts. Turning
   * it into a JavaScript number on the way out would reintroduce the binary
   * float this schema exists to avoid — 2.5 survives the trip, 0.1 does not.
   */
  commissionPercent: string;
  email: string | null;
  mobile: string | null;
  isActive: boolean;
}

export interface SalesExecutiveInput {
  code: string;
  name: string;
  commissionPercent: string;
  email: string | null;
  mobile: string | null;
  isActive: boolean;
}

@Injectable()
export class SalesExecutiveService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<SalesExecutiveView[]> {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const rows = await tx.salesExecutive.findMany({
        where: { deletedAt: null },
        orderBy: { code: "asc" },
      });

      return rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        commissionPercent: row.commissionPercent.toString(),
        email: row.email,
        mobile: row.mobile,
        isActive: row.isActive,
      }));
    });
  }

  async create(input: SalesExecutiveInput): Promise<{ id: string }> {
    const { clientId, actor } = requireRequestContext();
    const code = input.code.trim().toUpperCase();

    return this.prisma.forClient(clientId!, async (tx) => {
      const clash = await tx.salesExecutive.findFirst({ where: { code, deletedAt: null } });
      if (clash) {
        throw new BadRequestException(`A sales executive with code "${code}" already exists.`);
      }

      const row = await tx.salesExecutive.create({
        data: { clientId: clientId!, ...input, code },
      });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.sales_executive.created",
          entity: "sales_executive",
          entityId: row.id,
          metadata: { code, name: input.name, commissionPercent: input.commissionPercent },
        },
      });

      return { id: row.id };
    });
  }

  async update(id: string, input: SalesExecutiveInput): Promise<void> {
    const { clientId, actor } = requireRequestContext();
    const code = input.code.trim().toUpperCase();

    await this.prisma.forClient(clientId!, async (tx) => {
      const before = await tx.salesExecutive.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException("Sales executive not found.");

      const clash = await tx.salesExecutive.findFirst({
        where: { code, deletedAt: null, NOT: { id } },
      });
      if (clash) throw new BadRequestException("Another sales executive already uses that code.");

      await tx.salesExecutive.update({ where: { id }, data: { ...input, code } });

      // A commission change is a change to what someone is paid, so it is
      // recorded with both values rather than as "updated".
      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.sales_executive.updated",
          entity: "sales_executive",
          entityId: id,
          metadata: {
            from: { code: before.code, name: before.name, commissionPercent: before.commissionPercent.toString() },
            to: { code, name: input.name, commissionPercent: input.commissionPercent },
          },
        },
      });
    });
  }

  async remove(id: string): Promise<void> {
    const { clientId, actor } = requireRequestContext();

    await this.prisma.forClient(clientId!, async (tx) => {
      const row = await tx.salesExecutive.findFirst({ where: { id, deletedAt: null } });
      if (!row) throw new NotFoundException("Sales executive not found.");

      await tx.salesExecutive.update({ where: { id }, data: { deletedAt: new Date() } });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.sales_executive.deleted",
          entity: "sales_executive",
          entityId: id,
          metadata: { code: row.code, name: row.name },
        },
      });
    });
  }
}

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

import { requireRequestContext } from "../core/context/request-context";
import { PrismaService } from "../core/database/prisma.service";

export interface AccountGroupInput {
  code: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
}

/**
 * The chart of accounts, as a tree.
 *
 * Unpaged: a chart of accounts is dozens of rows, not thousands, and the
 * screen needs the whole list anyway to offer every group as a parent.
 *
 * The one rule the database cannot state is that a group must not be its own
 * ancestor. A check constraint catches the single-row case — a group whose
 * parent is itself — and the walk below catches the rest. Without it a
 * two-row cycle would make the trial balance recurse forever, and it would be
 * found in production rather than here.
 */
@Injectable()
export class AccountGroupService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const rows = await tx.accountGroup.findMany({
        where: { deletedAt: null },
        include: { parent: true, _count: { select: { children: true } } },
        orderBy: { code: "asc" },
      });

      return rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        isActive: row.isActive,
        childCount: row._count.children,
        parent: row.parent ? { id: row.parent.id, code: row.parent.code, name: row.parent.name } : null,
      }));
    });
  }

  async create(input: AccountGroupInput): Promise<{ id: string }> {
    const { clientId, actor } = requireRequestContext();
    const code = input.code.trim().toUpperCase();

    return this.prisma.forClient(clientId!, async (tx) => {
      const clash = await tx.accountGroup.findFirst({ where: { code, deletedAt: null } });
      if (clash) throw new BadRequestException(`A group with code "${code}" already exists.`);

      if (input.parentId) {
        const parent = await tx.accountGroup.findFirst({
          where: { id: input.parentId, deletedAt: null },
        });
        if (!parent) throw new BadRequestException("That parent group does not exist.");
      }

      const row = await tx.accountGroup.create({
        data: {
          clientId: clientId!,
          code,
          name: input.name.trim(),
          parentId: input.parentId,
          isActive: input.isActive,
        },
      });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.account_group.created",
          entity: "account_group",
          entityId: row.id,
          metadata: { code, name: input.name },
        },
      });

      return { id: row.id };
    });
  }

  async update(id: string, input: AccountGroupInput): Promise<void> {
    const { clientId, actor } = requireRequestContext();
    const code = input.code.trim().toUpperCase();

    await this.prisma.forClient(clientId!, async (tx) => {
      const before = await tx.accountGroup.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException("Group not found.");

      const clash = await tx.accountGroup.findFirst({ where: { code, deletedAt: null, NOT: { id } } });
      if (clash) throw new BadRequestException("Another group already uses that code.");

      if (input.parentId) {
        if (input.parentId === id) {
          throw new BadRequestException("A group cannot sit under itself.");
        }

        // Walk up from the proposed parent. If this group appears anywhere on
        // the way to a root, the move would close a loop.
        const rows = await tx.accountGroup.findMany({
          where: { deletedAt: null },
          select: { id: true, parentId: true, name: true },
        });
        const parentOf = new Map(rows.map((row) => [row.id, row.parentId]));

        let cursor: string | null = input.parentId;
        // Bounded by the number of groups: a corrupt cycle already in the data
        // must not hang the request that is trying to fix it.
        for (let step = 0; cursor && step <= rows.length; step += 1) {
          if (cursor === id) {
            throw new BadRequestException(
              `That would put "${before.name}" under one of its own subgroups.`,
            );
          }
          cursor = parentOf.get(cursor) ?? null;
        }
      }

      await tx.accountGroup.update({
        where: { id },
        data: { code, name: input.name.trim(), parentId: input.parentId, isActive: input.isActive },
      });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.account_group.updated",
          entity: "account_group",
          entityId: id,
          metadata: {
            from: { code: before.code, name: before.name, parentId: before.parentId },
            to: { code, name: input.name, parentId: input.parentId },
          },
        },
      });
    });
  }

  async remove(id: string): Promise<void> {
    const { clientId, actor } = requireRequestContext();

    await this.prisma.forClient(clientId!, async (tx) => {
      const row = await tx.accountGroup.findFirst({
        where: { id, deletedAt: null },
        include: { _count: { select: { children: true } } },
      });
      if (!row) throw new NotFoundException("Group not found.");

      // Deleting a parent would orphan its subgroups — they would still name
      // a group nothing lists, and the tree they belong to would lose its
      // middle. Reparent them first; that is a decision, not a side effect.
      if (row._count.children > 0) {
        throw new BadRequestException(
          `${row.name} has ${row._count.children} subgroup(s). Move them somewhere else first.`,
        );
      }

      await tx.accountGroup.update({ where: { id }, data: { deletedAt: new Date() } });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.account_group.deleted",
          entity: "account_group",
          entityId: id,
          metadata: { code: row.code, name: row.name },
        },
      });
    });
  }
}

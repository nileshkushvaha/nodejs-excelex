import { Controller, Get } from "@nestjs/common";

import { RequirePermission } from "../auth/auth.guard";
import { requireRequestContext } from "../core/context/request-context";
import { PrismaService } from "../core/database/prisma.service";

export interface DashboardSummary {
  readonly counts: { users: number; branches: number; roles: number; activeSessions: number };
  readonly recentActivity: Array<{
    id: string;
    action: string;
    entity: string | null;
    createdAt: string;
  }>;
}

/**
 * The first real read path. Nothing here filters by client — every count below
 * is scoped by the extension and again by row-level security, which is the whole
 * design working as intended: a service that forgets to filter cannot leak,
 * because it has no way to express an unscoped query.
 */
@Controller({ path: "dashboard", version: "1" })
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("summary")
  @RequirePermission("operations.dashboard.view")
  async summary(): Promise<DashboardSummary> {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const now = new Date();

      const [users, branches, roles, activeSessions, recent] = await Promise.all([
        tx.user.count({ where: { deletedAt: null, isActive: true } }),
        tx.branch.count({ where: { deletedAt: null } }),
        tx.role.count({ where: { deletedAt: null } }),
        tx.session.count({ where: { revokedAt: null, idleExpiresAt: { gt: now } } }),
        tx.auditEvent.findMany({
          orderBy: { createdAt: "desc" },
          take: 8,
          select: { id: true, action: true, entity: true, createdAt: true },
        }),
      ]);

      return {
        counts: { users, branches, roles, activeSessions },
        recentActivity: recent.map((event) => ({
          id: event.id,
          action: event.action,
          entity: event.entity,
          createdAt: event.createdAt.toISOString(),
        })),
      };
    });
  }
}

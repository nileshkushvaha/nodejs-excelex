import { Injectable } from "@nestjs/common";

import { requireRequestContext } from "../../core/context/request-context";
import { PrismaService } from "../../core/database/prisma.service";
import { NotFoundError } from "../../core/errors/app-error";
import { paginate, type PageRequest } from "../../masters/paged";

/**
 * The Exceptions screen's reads and its three verbs.
 *
 * Groups are the unit: a person deals with "the rate import keeps failing
 * on P2002", not with each of its forty occurrences. Resolve says "fixed" and
 * the group reopens by itself if it was not; ignore says "known, stop
 * showing me" and sticks; reopen is for changing one's mind. All three are
 * audited, because "who decided this was fine" is a question worth an
 * answer.
 */
export type GroupStatus = "OPEN" | "RESOLVED" | "IGNORED";

@Injectable()
export class ExceptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary() {
    const { clientId } = requireRequestContext();
    const dayAgo = new Date(Date.now() - 86_400_000);
    return this.prisma.forClient(clientId!, async (tx) => {
      const [open, last24h, groups24h, sources] = await Promise.all([
        tx.exceptionGroup.count({ where: { status: "OPEN" } }),
        tx.exceptionEvent.count({ where: { createdAt: { gte: dayAgo } } }),
        tx.exceptionGroup.count({ where: { lastSeenAt: { gte: dayAgo }, status: "OPEN" } }),
        tx.exceptionEvent.groupBy({ by: ["source"], where: { createdAt: { gte: dayAgo } }, _count: { _all: true } }),
      ]);
      return {
        openGroups: open,
        eventsLast24h: last24h,
        activeGroupsLast24h: groups24h,
        bySource: Object.fromEntries(sources.map((row) => [row.source, row._count._all])),
      };
    });
  }

  async groups(query: PageRequest & { status?: string; search?: string; source?: string }) {
    const { clientId } = requireRequestContext();
    return this.prisma.forClient(clientId!, async (tx) =>
      paginate(
        tx.exceptionGroup,
        {
          where: {
            ...(query.status ? { status: query.status as GroupStatus } : {}),
            ...(query.source ? { source: query.source } : {}),
            ...(query.search
              ? {
                  OR: [
                    { title: { contains: query.search, mode: "insensitive" } },
                    { code: { contains: query.search, mode: "insensitive" } },
                    { route: { contains: query.search, mode: "insensitive" } },
                  ],
                }
              : {}),
          },
          orderBy: [{ lastSeenAt: "desc" }],
          request: query,
        },
        serialiseGroup,
      ),
    );
  }

  async detail(fingerprint: string) {
    const { clientId } = requireRequestContext();
    return this.prisma.forClient(clientId!, async (tx) => {
      const group = await tx.exceptionGroup.findFirst({ where: { fingerprint } });
      if (!group) throw new NotFoundError("That exception group");
      const events = await tx.exceptionEvent.findMany({
        where: { fingerprint },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
      const perDay = await tx.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT date_trunc('day', created_at) AS day, count(*)::bigint AS count
        FROM exception_events
        WHERE fingerprint = ${fingerprint} AND created_at >= now() - interval '14 days'
        GROUP BY 1 ORDER BY 1`;
      return {
        group: serialiseGroup(group),
        events: events.map((row) => ({
          id: row.id,
          createdAt: row.createdAt.toISOString(),
          requestId: row.requestId,
          method: row.method,
          path: row.path,
          status: row.status,
          message: row.message,
          stack: row.stack,
          actorId: row.actorId,
          ip: row.ip,
          context: row.context,
        })),
        perDay: perDay.map((row) => ({ day: row.day.toISOString().slice(0, 10), count: Number(row.count) })),
      };
    });
  }

  async setStatus(fingerprint: string, status: GroupStatus) {
    const { clientId, actor, ip, userAgent } = requireRequestContext();
    return this.prisma.forClient(clientId!, async (tx) => {
      const group = await tx.exceptionGroup.findFirst({ where: { fingerprint } });
      if (!group) throw new NotFoundError("That exception group");
      const updated = await tx.exceptionGroup.update({
        where: { id: group.id },
        data: {
          status,
          resolvedAt: status === "OPEN" ? null : new Date(),
          resolvedById: status === "OPEN" ? null : (actor?.userId ?? null),
          ...(status === "OPEN" ? {} : { regressedAt: null }),
        },
      });
      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: `system.exception.${status.toLowerCase()}`,
          entity: "exception_group",
          entityId: group.id,
          metadata: { fingerprint, title: group.title, count: group.count },
          ip: ip ?? null,
          userAgent: userAgent ?? null,
        },
      });
      return serialiseGroup(updated);
    });
  }
}

function serialiseGroup(row: {
  id: string; fingerprint: string; title: string; code: string; exceptionName: string; route: string | null; source: string;
  status: string; count: number; firstSeenAt: Date; lastSeenAt: Date; resolvedAt: Date | null; regressedAt: Date | null;
}) {
  return {
    id: row.id,
    fingerprint: row.fingerprint,
    title: row.title,
    code: row.code,
    exceptionName: row.exceptionName,
    route: row.route,
    source: row.source,
    status: row.status,
    count: row.count,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    regressedAt: row.regressedAt?.toISOString() ?? null,
  };
}

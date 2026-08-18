import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@excelex/database";

import { requireRequestContext } from "../../core/context/request-context";
import { PrismaService } from "../../core/database/prisma.service";
import { paginate, type Page, type PageRequest } from "../../masters/paged";

export interface ActivityFilters {
  readonly actorId?: string;
  readonly action?: string;
  readonly actionPrefix?: string;
  readonly entity?: string;
  readonly entityId?: string;
  readonly ip?: string;
  readonly from?: Date;
  readonly to?: Date;
  readonly search?: string;
}

export interface Actor {
  id: string;
  fullName: string;
  email: string;
}

export interface ActivityRow {
  id: string;
  createdAt: string;
  action: string;
  actionLabel: string;
  entity: string | null;
  entityId: string | null;
  actor: Actor | null;
  ip: string | null;
  requestId: string | null;
  hasMetadata: boolean;
}

export interface ActivityDetail extends ActivityRow {
  metadata: unknown;
  userAgent: string | null;
}

export interface ActivityFacets {
  domains: Array<{ domain: string; actions: Array<{ action: string; label: string; count: number }> }>;
  entities: string[];
  actors: Array<{ actor: Actor; count: number }>;
}

export interface ActivitySummary {
  window: { days: number; from: string; to: string };
  totals: { events: number; actors: number; perDay: Array<{ day: string; count: number }> };
  topActions: Array<{ action: string; label: string; count: number }>;
  topActors: Array<{ actor: Actor | null; count: number }>;
  byDomain: Array<{ domain: string; count: number }>;
}

interface EventRecord {
  id: string;
  createdAt: Date;
  action: string;
  entity: string | null;
  entityId: string | null;
  actorId: string | null;
  ip: string | null;
  requestId: string | null;
  metadata: unknown;
}

const LIST_SELECT = {
  id: true,
  createdAt: true,
  action: true,
  entity: true,
  entityId: true,
  actorId: true,
  ip: true,
  requestId: true,
  metadata: true,
} as const;

/**
 * "masters.customer.updated" → "Customer updated".
 *
 * The middle segment is the noun and the last the verb, which is what the
 * audit vocabulary has always been. Anything shorter or longer is shown with
 * dots swapped for spaces rather than guessed at.
 */
export function humaniseAction(action: string): string {
  const parts = action.split(".");
  const words = (part: string) => part.replace(/_/g, " ");
  if (parts.length >= 3) {
    const noun = words(parts[parts.length - 2]!);
    const verb = words(parts[parts.length - 1]!);
    return `${noun.charAt(0).toUpperCase()}${noun.slice(1)} ${verb}`;
  }
  const flat = parts.map(words).join(" ");
  return `${flat.charAt(0).toUpperCase()}${flat.slice(1)}`;
}

/** The domain is the first segment: masters, access, auth, settings, system. */
export function actionDomain(action: string): string {
  return action.split(".")[0] ?? action;
}

/**
 * Reads the audit trail for the activity log.
 *
 * Reads only: the table has UPDATE and DELETE revoked from every runtime role,
 * and this service does not even own a Prisma delegate that could try. Actors
 * are joined by a second query over the page's ids, because `actorId` is
 * intentionally not a relation — an event outlives the account that caused it,
 * and a missing actor is rendered as "System" rather than as an error.
 *
 * Search covers action, entity and entityId. Searching inside the metadata
 * JSON was considered and left out: it needs a raw `metadata::text ILIKE`
 * over an unindexed column, which on a large trail is a full scan per
 * keystroke, and the detail view already shows the metadata for any row the
 * other filters find.
 */
@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  private where(filters: ActivityFilters): Prisma.AuditEventWhereInput {
    const and: Prisma.AuditEventWhereInput[] = [];

    if (filters.actorId) and.push({ actorId: filters.actorId });
    if (filters.action) and.push({ action: filters.action });
    if (filters.actionPrefix) and.push({ action: { startsWith: `${filters.actionPrefix}.` } });
    if (filters.entity) and.push({ entity: filters.entity });
    if (filters.entityId) and.push({ entityId: filters.entityId });
    if (filters.ip) and.push({ ip: filters.ip });
    if (filters.from || filters.to) {
      and.push({
        createdAt: {
          ...(filters.from ? { gte: filters.from } : {}),
          ...(filters.to ? { lte: filters.to } : {}),
        },
      });
    }
    if (filters.search) {
      const term = filters.search.trim();
      and.push({
        OR: [
          { action: { contains: term, mode: "insensitive" } },
          { entity: { contains: term, mode: "insensitive" } },
          { entityId: { contains: term, mode: "insensitive" } },
        ],
      });
    }

    return and.length ? { AND: and } : {};
  }

  async list(filters: ActivityFilters, request: PageRequest): Promise<Page<ActivityRow>> {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const page = await paginate<EventRecord, EventRecord>(
        tx.auditEvent,
        { where: this.where(filters), orderBy: { createdAt: "desc" }, request },
        (row) => row,
      );
      // paginate() has no select, so the row carries metadata; it is dropped
      // in toRow() and only its presence is reported.
      return { ...page, rows: await this.decorate(tx, page.rows) };
    });
  }

  async page(filters: ActivityFilters, skip: number, take: number): Promise<ActivityRow[]> {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const rows = (await tx.auditEvent.findMany({
        where: this.where(filters),
        orderBy: { createdAt: "desc" },
        skip,
        take,
        select: LIST_SELECT,
      })) as EventRecord[];
      return this.decorate(tx, rows);
    });
  }

  async byId(id: string): Promise<ActivityDetail> {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const row = await tx.auditEvent.findFirst({ where: { id } });
      if (!row) throw new NotFoundException("That event does not exist.");

      const [decorated] = await this.decorate(tx, [row]);
      return { ...decorated!, metadata: row.metadata ?? null, userAgent: row.userAgent };
    });
  }

  async timeline(entity: string, entityId: string): Promise<ActivityRow[]> {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const rows = (await tx.auditEvent.findMany({
        where: { entity, entityId },
        orderBy: { createdAt: "asc" },
        take: 500,
        select: LIST_SELECT,
      })) as EventRecord[];
      return this.decorate(tx, rows);
    });
  }

  async facets(): Promise<ActivityFacets> {
    const { clientId } = requireRequestContext();
    const since = new Date(Date.now() - 90 * 86_400_000);

    return this.prisma.forClient(clientId!, async (tx) => {
      const [actions, entities, actors] = await Promise.all([
        tx.auditEvent.groupBy({
          by: ["action"],
          where: { createdAt: { gte: since } },
          _count: { _all: true },
          orderBy: { action: "asc" },
          take: 500,
        }),
        tx.auditEvent.findMany({
          where: { createdAt: { gte: since }, entity: { not: null } },
          distinct: ["entity"],
          select: { entity: true },
          orderBy: { entity: "asc" },
        }),
        tx.auditEvent.groupBy({
          by: ["actorId"],
          where: { createdAt: { gte: since }, actorId: { not: null } },
          _count: { _all: true },
          orderBy: { _count: { actorId: "desc" } },
          take: 100,
        }),
      ]);

      const actorRows = await this.actors(
        tx,
        actors.map((row) => row.actorId).filter((id): id is string => Boolean(id)),
      );

      const domains = new Map<string, Array<{ action: string; label: string; count: number }>>();
      for (const row of actions) {
        const domain = actionDomain(row.action);
        const bucket = domains.get(domain) ?? [];
        bucket.push({ action: row.action, label: humaniseAction(row.action), count: row._count._all });
        domains.set(domain, bucket);
      }

      return {
        domains: [...domains.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([domain, list]) => ({ domain, actions: list })),
        entities: entities.map((row) => row.entity).filter((entity): entity is string => Boolean(entity)),
        actors: actors
          .map((row) => ({ actor: actorRows.get(row.actorId!), count: row._count._all }))
          .filter((row): row is { actor: Actor; count: number } => Boolean(row.actor)),
      };
    });
  }

  async summary(days: number): Promise<ActivitySummary> {
    const { clientId } = requireRequestContext();
    const now = new Date();
    const from = new Date(now.getTime() - days * 86_400_000);

    return this.prisma.forClient(clientId!, async (tx) => {
      const inWindow = { createdAt: { gte: from } };

      const [events, distinctActors, perDay, topActions, topActors, byAction] = await Promise.all([
        tx.auditEvent.count({ where: inWindow }),
        tx.auditEvent.findMany({
          where: { ...inWindow, actorId: { not: null } },
          distinct: ["actorId"],
          select: { actorId: true },
        }),
        tx.$queryRaw<Array<{ day: Date; count: bigint }>>`
          SELECT date_trunc('day', created_at) AS day, count(*) AS count
            FROM audit_events
           WHERE created_at >= ${from}
           GROUP BY 1
           ORDER BY 1
        `,
        tx.auditEvent.groupBy({
          by: ["action"],
          where: inWindow,
          _count: { _all: true },
          orderBy: { _count: { action: "desc" } },
          take: 10,
        }),
        tx.auditEvent.groupBy({
          by: ["actorId"],
          where: inWindow,
          _count: { _all: true },
          orderBy: { _count: { actorId: "desc" } },
          take: 10,
        }),
        // Domain is a prefix of the action, so grouped by action and folded
        // here rather than asking SQL to split strings.
        tx.auditEvent.groupBy({
          by: ["action"],
          where: inWindow,
          _count: { _all: true },
        }),
      ]);

      const actorRows = await this.actors(
        tx,
        topActors.map((row) => row.actorId).filter((id): id is string => Boolean(id)),
      );

      const dayCounts = new Map<string, number>();
      for (let offset = days - 1; offset >= 0; offset -= 1) {
        dayCounts.set(new Date(now.getTime() - offset * 86_400_000).toISOString().slice(0, 10), 0);
      }
      for (const row of perDay) {
        dayCounts.set(new Date(row.day).toISOString().slice(0, 10), Number(row.count));
      }

      const domainCounts = new Map<string, number>();
      for (const row of byAction) {
        const domain = actionDomain(row.action);
        domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + row._count._all);
      }

      return {
        window: { days, from: from.toISOString(), to: now.toISOString() },
        totals: {
          events,
          actors: distinctActors.length,
          perDay: [...dayCounts.entries()].map(([day, count]) => ({ day, count })),
        },
        topActions: topActions.map((row) => ({
          action: row.action,
          label: humaniseAction(row.action),
          count: row._count._all,
        })),
        topActors: topActors.map((row) => ({
          actor: row.actorId ? (actorRows.get(row.actorId) ?? null) : null,
          count: row._count._all,
        })),
        byDomain: [...domainCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([domain, count]) => ({ domain, count })),
      };
    });
  }

  private async actors(
    tx: { user: { findMany: (args: unknown) => Promise<unknown[]> } },
    ids: string[],
  ): Promise<Map<string, Actor>> {
    if (ids.length === 0) return new Map();
    const users = (await tx.user.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, fullName: true, email: true },
    })) as Actor[];
    return new Map(users.map((user) => [user.id, user]));
  }

  private async decorate(
    tx: { user: { findMany: (args: unknown) => Promise<unknown[]> } },
    rows: EventRecord[],
  ): Promise<ActivityRow[]> {
    const actorRows = await this.actors(
      tx,
      rows.map((row) => row.actorId).filter((id): id is string => Boolean(id)),
    );

    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      action: row.action,
      actionLabel: humaniseAction(row.action),
      entity: row.entity,
      entityId: row.entityId,
      actor: row.actorId ? (actorRows.get(row.actorId) ?? null) : null,
      ip: row.ip,
      requestId: row.requestId,
      hasMetadata: row.metadata !== null && row.metadata !== undefined,
    }));
  }
}

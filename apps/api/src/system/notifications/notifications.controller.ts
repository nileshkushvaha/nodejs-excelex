import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { z } from "zod";

import { requireRequestContext } from "../../core/context/request-context";
import { PrismaService } from "../../core/database/prisma.service";
import { parseOrThrow } from "../../core/errors/validation";
import { NotificationService } from "../../core/notifications/notification.service";
import { paginate, readPageRequest } from "../../masters/paged";

/**
 * A person's own notifications. No permission beyond being signed in: the
 * rows are already theirs, filtered by user id under their client's RLS.
 */
@Controller({ path: "notifications", version: "1" })
export class NotificationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  @Get()
  list(@Query() query: Record<string, string>) {
    const { clientId, actor } = requireRequestContext();
    const { unread, kind } = parseOrThrow(listSchema, query);
    return this.prisma.forClient(clientId!, async (tx) =>
      paginate(
        tx.notification,
        {
          where: { userId: actor!.userId, ...(unread ? { readAt: null } : {}), ...(kind ? { kind } : {}) },
          orderBy: { createdAt: "desc" },
          request: readPageRequest(query),
        },
        serialise,
      ),
    );
  }

  /** For the bell: cheap enough to poll. */
  @Get("unread-count")
  async unreadCount() {
    const { clientId, actor } = requireRequestContext();
    return { count: await this.notifications.unreadCount(clientId!, actor!.userId) };
  }

  /** The bell's dropdown: the latest few and the count, in one call. */
  @Get("recent")
  async recent() {
    const { clientId, actor } = requireRequestContext();
    const [rows, count] = await Promise.all([
      this.prisma.forClient(clientId!, async (tx) =>
        tx.notification.findMany({ where: { userId: actor!.userId }, orderBy: { createdAt: "desc" }, take: 8 }),
      ),
      this.notifications.unreadCount(clientId!, actor!.userId),
    ]);
    return { unread: count, rows: rows.map(serialise) };
  }

  @Post(":id/read")
  @HttpCode(200)
  async markRead(@Param("id", ParseUUIDPipe) id: string) {
    const { clientId, actor } = requireRequestContext();
    return { updated: await this.notifications.markRead(clientId!, actor!.userId, [id]) };
  }

  @Post("read")
  @HttpCode(200)
  async markManyRead(@Body() body: unknown) {
    const { clientId, actor } = requireRequestContext();
    const { ids } = parseOrThrow(readSchema, body);
    return { updated: await this.notifications.markRead(clientId!, actor!.userId, ids ?? "all") };
  }
}

const listSchema = z.object({
  unread: z.enum(["1", "true"]).optional().transform(Boolean),
  kind: z.string().max(80).optional(),
});

const readSchema = z.object({
  /** Omit to mark everything read. */
  ids: z.array(z.string().uuid()).max(500).optional(),
});

function serialise(row: {
  id: string; kind: string; severity: string; title: string; body: string; href: string | null;
  entityType: string | null; entityId: string | null; readAt: Date | null; createdAt: Date; mailMessageId: string | null;
}) {
  return {
    id: row.id,
    kind: row.kind,
    severity: row.severity,
    title: row.title,
    body: row.body,
    href: row.href,
    entity: row.entityType ? { type: row.entityType, id: row.entityId } : null,
    emailed: Boolean(row.mailMessageId),
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

import { Controller, Get, Param, ParseUUIDPipe, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";

import { RequirePermission } from "../../auth/auth.guard";
import { requireRequestContext } from "../../core/context/request-context";
import { PrismaService } from "../../core/database/prisma.service";
import { readPageRequest } from "../../masters/paged";
import { streamCsv } from "../csv-stream";
import { ActivityService, type ActivityFilters } from "./activity.service";
import { parseOrThrow } from "../../core/errors/validation";

const isoDate = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Dates must be ISO 8601.")
  .transform((value) => new Date(value));

const key = z.string().trim().max(120).regex(/^[a-z0-9_.-]+$/i, "Keys are dotted lower-case words.");

const filtersSchema = z.object({
  actorId: z.string().uuid("actorId must be a UUID.").optional(),
  action: key.optional(),
  actionPrefix: key.optional(),
  entity: z.string().trim().max(120).optional(),
  entityId: z.string().trim().max(200).optional(),
  ip: z.string().trim().max(64).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  search: z.string().trim().max(200).optional(),
});

const summarySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
});

/**
 * The activity log: the audit trail, readable.
 *
 * Every handler is a GET and every one requires settings.audit.view — the
 * table cannot be changed through this API or any other, and this controller
 * has no route that would try. The export writes an audit event of its own,
 * because a copy of the trail leaving the system is itself an event worth
 * finding later.
 *
 * Route order matters to Nest: the literal segments (summary, facets, export,
 * entity) are declared before ":id" so they are never swallowed by it.
 */
@Controller({ path: "system/activity", version: "1" })
export class ActivityController {
  constructor(
    private readonly activity: ActivityService,
    private readonly prisma: PrismaService,
  ) {}

  private filters(query: Record<string, string>): ActivityFilters {
    const cleaned = Object.fromEntries(Object.entries(query).filter(([, value]) => value !== ""));
    const parsed = parseOrThrow(filtersSchema, cleaned);
    return parsed;
  }

  @Get()
  @RequirePermission("settings.audit.view")
  list(@Query() query: Record<string, string>) {
    return this.activity.list(this.filters(query), readPageRequest(query));
  }

  @Get("facets")
  @RequirePermission("settings.audit.view")
  facets() {
    return this.activity.facets();
  }

  @Get("summary")
  @RequirePermission("settings.audit.view")
  summary(@Query() query: Record<string, string>) {
    const parsed = parseOrThrow(summarySchema, query);
    return this.activity.summary(parsed.days);
  }

  @Get("export")
  @RequirePermission("settings.audit.view")
  async export(@Query() query: Record<string, string>, @Res() response: Response): Promise<void> {
    const filters = this.filters(query);
    const stamp = new Date().toISOString().slice(0, 10);

    const written = await streamCsv(
      response,
      `activity-${stamp}.csv`,
      ["When", "Action", "Label", "Entity", "Entity id", "Actor", "Actor email", "IP", "Request id"],
      (skip, take) => this.activity.page(filters, skip, take),
      (row) => [
        row.createdAt,
        row.action,
        row.actionLabel,
        row.entity,
        row.entityId,
        row.actor?.fullName ?? "System",
        row.actor?.email ?? "",
        row.ip,
        row.requestId,
      ],
    );

    const { clientId, actor, ip, userAgent, requestId } = requireRequestContext();
    await this.prisma.forClient(clientId!, async (tx) => {
      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "system.activity.exported",
          entity: "audit_event",
          metadata: { filters: query, rows: written },
          ip: ip ?? null,
          userAgent: userAgent ?? null,
          requestId,
        },
      });
    });
  }

  @Get("entity/:entity/:entityId")
  @RequirePermission("settings.audit.view")
  timeline(@Param("entity") entity: string, @Param("entityId") entityId: string) {
    return this.activity.timeline(entity, entityId);
  }

  @Get(":id")
  @RequirePermission("settings.audit.view")
  byId(@Param("id", ParseUUIDPipe) id: string) {
    return this.activity.byId(id);
  }
}

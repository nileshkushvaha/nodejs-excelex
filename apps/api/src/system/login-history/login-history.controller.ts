import { Controller, Get, Param, ParseUUIDPipe, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";

import { RequirePermission } from "../../auth/auth.guard";
import { requireRequestContext } from "../../core/context/request-context";
import { PrismaService } from "../../core/database/prisma.service";
import { readPageRequest } from "../../masters/paged";
import { streamCsv } from "../csv-stream";
import { LoginHistoryQueryService, type LoginHistoryFilters } from "./login-history-query.service";
import { LOGIN_OUTCOMES } from "./login-history.service";
import { parseOrThrow } from "../../core/errors/validation";

const isoDate = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Dates must be ISO 8601.")
  .transform((value) => new Date(value));

const filtersSchema = z.object({
  outcome: z.enum(LOGIN_OUTCOMES).optional(),
  userId: z.string().uuid("userId must be a UUID.").optional(),
  email: z.string().trim().max(320).optional(),
  ip: z.string().trim().max(64).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  search: z.string().trim().max(200).optional(),
});

const summarySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
});

/**
 * Login history: who tried to sign in, and what happened.
 *
 * Read-only by design. Unlocking a user and revoking a session already exist
 * on the user screens, and a second path to the same mutation is a second
 * place for the audit trail to be forgotten. The export is the one thing here
 * that is itself audited, because a CSV of every address that ever tried to
 * sign in is personal data leaving the system.
 */
@Controller({ path: "system/login-history", version: "1" })
export class LoginHistoryController {
  constructor(
    private readonly history: LoginHistoryQueryService,
    private readonly prisma: PrismaService,
  ) {}

  private filters(query: Record<string, string>): LoginHistoryFilters {
    // Empty strings are what a cleared filter box sends; they mean "not set".
    const cleaned = Object.fromEntries(Object.entries(query).filter(([, value]) => value !== ""));
    const parsed = parseOrThrow(filtersSchema, cleaned);
    return parsed;
  }

  @Get()
  @RequirePermission("system.login.view")
  list(@Query() query: Record<string, string>) {
    return this.history.list(this.filters(query), readPageRequest(query));
  }

  @Get("summary")
  @RequirePermission("system.login.view")
  summary(@Query() query: Record<string, string>) {
    const parsed = parseOrThrow(summarySchema, query);
    return this.history.summary(parsed.days);
  }

  @Get("export")
  @RequirePermission("system.login.view")
  async export(@Query() query: Record<string, string>, @Res() response: Response): Promise<void> {
    const filters = this.filters(query);
    const stamp = new Date().toISOString().slice(0, 10);

    const written = await streamCsv(
      response,
      `login-history-${stamp}.csv`,
      ["When", "Email", "User", "Outcome", "IP", "Browser", "OS", "User agent", "Host", "Session id"],
      (skip, take) => this.history.page(filters, skip, take),
      (row) => [
        row.createdAt,
        row.email,
        row.user?.fullName ?? "",
        row.outcome,
        row.ip,
        row.device.browser,
        row.device.os,
        row.userAgent,
        row.host,
        row.sessionId,
      ],
    );

    const { clientId, actor, ip, userAgent, requestId } = requireRequestContext();
    await this.prisma.forClient(clientId!, async (tx) => {
      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "system.login_history.exported",
          entity: "login_attempt",
          metadata: { filters: query, rows: written },
          ip: ip ?? null,
          userAgent: userAgent ?? null,
          requestId,
        },
      });
    });
  }

  @Get("users/:userId")
  @RequirePermission("system.login.view")
  forUser(@Param("userId", ParseUUIDPipe) userId: string) {
    return this.history.forUser(userId);
  }
}

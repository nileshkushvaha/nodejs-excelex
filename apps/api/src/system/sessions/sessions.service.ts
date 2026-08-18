import { Injectable } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";

import { ActorCache } from "../../auth/actor-cache";
import { requireRequestContext } from "../../core/context/request-context";
import { PrismaService } from "../../core/database/prisma.service";
import { NotFoundError } from "../../core/errors/app-error";
import { paginate, type PageRequest } from "../../masters/paged";
import { SecuritySettingsService } from "../../settings/security-settings.service";
import { parseUserAgent } from "../login-history/user-agent";

/**
 * Who is signed in right now, and the means to end it.
 *
 * An administrator's view over every live session in the account — the
 * person, the device, the address, when it began, when it was last used
 * and when it will end — with revoke for one session or for everything a
 * person holds. Revoking is what an administrator does when a laptop is
 * lost or a leaver's access must end now; it never deletes the row, because
 * the row is the evidence, and it drops the cached actor so the next
 * request on that token is refused rather than served from memory.
 *
 * "Last active" is derived: the idle window slides on every request, so
 * the last request was idle-timeout before the idle expiry. Exact to the
 * request, which is what the question needs.
 */
export interface SessionListQuery extends PageRequest {
  userId?: string;
  search?: string;
}

@Injectable()
export class SessionsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * The root module's ActorCache — the one the guard fills. A second
   * instance provided here would be empty and forgetting from it would
   * forget nothing; the revoked session would keep being served for ten
   * seconds. Resolved through the container so there is exactly one.
   */
  private get actors(): ActorCache {
    return this.moduleRef.get(ActorCache, { strict: false });
  }

  async summary() {
    const { clientId } = requireRequestContext();
    const now = new Date();
    return this.prisma.forClient(clientId!, async (tx) => {
      const live = { revokedAt: null, idleExpiresAt: { gt: now }, absoluteExpiry: { gt: now } };
      const [sessions, users, lastHour] = await Promise.all([
        tx.session.count({ where: live }),
        tx.session.groupBy({ by: ["userId"], where: live }),
        tx.session.count({ where: { ...live, createdAt: { gte: new Date(now.getTime() - 3_600_000) } } }),
      ]);
      return { activeSessions: sessions, signedInUsers: users.length, signedInLastHour: lastHour };
    });
  }

  async list(query: SessionListQuery) {
    const { clientId, actor } = requireRequestContext();
    const now = new Date();
    return this.prisma.forClient(clientId!, async (tx) => {
      const settings = SecuritySettingsService.toSettings(await tx.securitySettings.findFirst());
      const idleMs = settings.idleTimeoutMinutes * 60_000;

      const users = query.search
        ? await tx.user.findMany({
            where: {
              OR: [
                { email: { contains: query.search, mode: "insensitive" } },
                { fullName: { contains: query.search, mode: "insensitive" } },
              ],
            },
            select: { id: true },
          })
        : null;

      const page = await paginate(
        tx.session,
        {
          where: {
            revokedAt: null,
            idleExpiresAt: { gt: now },
            absoluteExpiry: { gt: now },
            ...(query.userId ? { userId: query.userId } : {}),
            ...(query.search
              ? {
                  OR: [
                    { userId: { in: users!.map((u) => u.id) } },
                    { ip: { contains: query.search } },
                  ],
                }
              : {}),
          },
          orderBy: { idleExpiresAt: "desc" },
          request: query,
        },
        (row: {
          id: string; userId: string; host: string; ip: string | null; userAgent: string | null;
          createdAt: Date; idleExpiresAt: Date; absoluteExpiry: Date;
        }) => ({
          id: row.id,
          userId: row.userId,
          host: row.host,
          ip: row.ip,
          userAgent: row.userAgent,
          device: row.userAgent ? parseUserAgent(row.userAgent) : null,
          signedInAt: row.createdAt.toISOString(),
          lastActiveAt: new Date(row.idleExpiresAt.getTime() - idleMs).toISOString(),
          idleExpiresAt: row.idleExpiresAt.toISOString(),
          absoluteExpiry: row.absoluteExpiry.toISOString(),
          isSelf: row.userId === actor?.userId,
        }),
      );

      const userIds = [...new Set(page.rows.map((row) => row.userId))];
      const people = await tx.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, fullName: true, email: true, isActive: true },
      });
      const byId = new Map(people.map((p) => [p.id, p]));
      return {
        ...page,
        rows: page.rows.map((row) => ({ ...row, user: byId.get(row.userId) ?? null })),
      };
    });
  }

  async revoke(sessionId: string): Promise<{ revoked: number }> {
    const { clientId, actor, ip, userAgent } = requireRequestContext();
    return this.prisma.forClient(clientId!, async (tx) => {
      const session = await tx.session.findFirst({ where: { id: sessionId } });
      if (!session) throw new NotFoundError("That session");
      const { count } = await tx.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
      this.actors.forget(session.tokenHash);
      if (count) {
        await tx.auditEvent.create({
          data: {
            clientId: clientId!,
            actorId: actor?.userId ?? null,
            action: "auth.session.revoked",
            entity: "session",
            entityId: session.id,
            metadata: { byAdministrator: true, targetUserId: session.userId },
            ip: ip ?? null,
            userAgent: userAgent ?? null,
          },
        });
      }
      return { revoked: count };
    });
  }

  async revokeAllForUser(userId: string): Promise<{ revoked: number }> {
    const { clientId, actor, ip, userAgent } = requireRequestContext();
    return this.prisma.forClient(clientId!, async (tx) => {
      const { count } = await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      this.actors.forgetUser(userId);
      if (count) {
        await tx.auditEvent.create({
          data: {
            clientId: clientId!,
            actorId: actor?.userId ?? null,
            action: "auth.session.revoked",
            entity: "user",
            entityId: userId,
            metadata: { byAdministrator: true, all: true, count },
            ip: ip ?? null,
            userAgent: userAgent ?? null,
          },
        });
      }
      return { revoked: count };
    });
  }
}

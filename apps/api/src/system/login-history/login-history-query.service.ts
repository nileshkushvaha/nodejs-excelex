import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@excelex/database";

import { requireRequestContext } from "../../core/context/request-context";
import { PrismaService } from "../../core/database/prisma.service";
import { paginate, type Page, type PageRequest } from "../../masters/paged";
import { LOGIN_OUTCOMES, type LoginOutcome } from "./login-history.service";
import { parseUserAgent, type Device } from "./user-agent";

export interface LoginHistoryFilters {
  readonly outcome?: LoginOutcome;
  readonly userId?: string;
  readonly email?: string;
  readonly ip?: string;
  readonly from?: Date;
  readonly to?: Date;
  readonly search?: string;
}

export interface LoginAttemptRow {
  id: string;
  createdAt: string;
  email: string;
  user: { id: string; fullName: string; email: string; isActive: boolean; lockedUntil: string | null } | null;
  outcome: LoginOutcome;
  ip: string | null;
  userAgent: string | null;
  device: Device;
  host: string;
  sessionId: string | null;
  sessionActive: boolean;
}

export interface LoginHistorySummary {
  window: { days: number; from: string; to: string };
  totals: {
    attempts: number;
    succeeded: number;
    failed: number;
    lockedOut: number;
    uniqueUsers: number;
    uniqueIps: number;
  };
  byDay: Array<{ day: string; succeeded: number; failed: number }>;
  topFailingEmails: Array<{ email: string; count: number }>;
  topIps: Array<{ ip: string; count: number }>;
  currentlyLocked: Array<{
    id: string;
    fullName: string;
    email: string;
    lockedUntil: string;
    failedLoginAttempts: number;
  }>;
  activeSessions: number;
}

export interface UserLoginHistory {
  user: { id: string; fullName: string; email: string; isActive: boolean; lockedUntil: string | null };
  attempts: LoginAttemptRow[];
  activeSessions: Array<{
    id: string;
    ip: string | null;
    userAgent: string | null;
    device: Device;
    createdAt: string;
    idleExpiresAt: string;
  }>;
}

/** The columns a list row needs; the shape Prisma returns for the select below. */
interface AttemptRecord {
  id: string;
  createdAt: Date;
  email: string;
  userId: string | null;
  outcome: string;
  ip: string | null;
  userAgent: string | null;
  host: string;
  sessionId: string | null;
}

const ATTEMPT_SELECT = {
  id: true,
  createdAt: true,
  email: true,
  userId: true,
  outcome: true,
  ip: true,
  userAgent: true,
  host: true,
  sessionId: true,
} as const;

/**
 * Reads the login history for the screen.
 *
 * `LoginAttempt.userId` is deliberately not a relation — an attempt outlives
 * the account it named — so the user's name is joined in a second query over
 * the page's ids rather than with an include. Same for the session: it is
 * looked up by id, and "active" is computed here from its expiry columns, so
 * the table can show a live dot without a second endpoint.
 *
 * Every read is inside forClient(): row-level security scopes the raw
 * per-day query the same way it scopes the Prisma ones.
 */
@Injectable()
export class LoginHistoryQueryService {
  constructor(private readonly prisma: PrismaService) {}

  private where(filters: LoginHistoryFilters): Prisma.LoginAttemptWhereInput {
    const and: Prisma.LoginAttemptWhereInput[] = [];

    if (filters.outcome) and.push({ outcome: filters.outcome });
    if (filters.userId) and.push({ userId: filters.userId });
    if (filters.email) and.push({ email: { contains: filters.email, mode: "insensitive" } });
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
        OR: [{ email: { contains: term, mode: "insensitive" } }, { ip: { contains: term } }],
      });
    }

    return and.length ? { AND: and } : {};
  }

  async list(filters: LoginHistoryFilters, request: PageRequest): Promise<Page<LoginAttemptRow>> {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const page = await paginate<AttemptRecord, AttemptRecord>(
        tx.loginAttempt,
        { where: this.where(filters), orderBy: { createdAt: "desc" }, request },
        (row) => row,
      );

      const rows = await this.decorate(tx, page.rows);
      return { ...page, rows };
    });
  }

  /** Streams pages for the CSV export; the caller owns the response. */
  async page(filters: LoginHistoryFilters, skip: number, take: number): Promise<LoginAttemptRow[]> {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const rows = (await tx.loginAttempt.findMany({
        where: this.where(filters),
        orderBy: { createdAt: "desc" },
        skip,
        take,
        select: ATTEMPT_SELECT,
      })) as AttemptRecord[];
      return this.decorate(tx, rows);
    });
  }

  async summary(days: number): Promise<LoginHistorySummary> {
    const { clientId } = requireRequestContext();
    const now = new Date();
    const from = new Date(now.getTime() - days * 86_400_000);

    return this.prisma.forClient(clientId!, async (tx) => {
      const inWindow = { createdAt: { gte: from } };

      const [attempts, succeeded, lockedOut, byUser, byIp, byDay, failingEmails, topIps, locked, activeSessions] =
        await Promise.all([
          tx.loginAttempt.count({ where: inWindow }),
          tx.loginAttempt.count({ where: { ...inWindow, outcome: "SUCCEEDED" } }),
          tx.loginAttempt.count({ where: { ...inWindow, outcome: "LOCKED_OUT" } }),
          tx.loginAttempt.findMany({
            where: { ...inWindow, userId: { not: null } },
            distinct: ["userId"],
            select: { userId: true },
          }),
          tx.loginAttempt.findMany({
            where: { ...inWindow, ip: { not: null } },
            distinct: ["ip"],
            select: { ip: true },
          }),
          tx.$queryRaw<Array<{ day: Date; succeeded: bigint; failed: bigint }>>`
            SELECT date_trunc('day', created_at) AS day,
                   count(*) FILTER (WHERE outcome = 'SUCCEEDED') AS succeeded,
                   count(*) FILTER (WHERE outcome <> 'SUCCEEDED') AS failed
              FROM login_attempts
             WHERE created_at >= ${from}
             GROUP BY 1
             ORDER BY 1
          `,
          tx.loginAttempt.groupBy({
            by: ["email"],
            where: { ...inWindow, outcome: { not: "SUCCEEDED" } },
            _count: { _all: true },
            orderBy: { _count: { email: "desc" } },
            take: 5,
          }),
          tx.loginAttempt.groupBy({
            by: ["ip"],
            where: { ...inWindow, ip: { not: null } },
            _count: { _all: true },
            orderBy: { _count: { ip: "desc" } },
            take: 5,
          }),
          tx.user.findMany({
            where: { deletedAt: null, lockedUntil: { gt: now } },
            select: { id: true, fullName: true, email: true, lockedUntil: true, failedLoginAttempts: true },
            orderBy: { lockedUntil: "desc" },
            take: 50,
          }),
          tx.session.count({
            where: { revokedAt: null, absoluteExpiry: { gt: now }, idleExpiresAt: { gt: now } },
          }),
        ]);

      // Days with no attempts still get a bar, or the chart's x-axis lies
      // about how long the window is.
      const perDay = new Map<string, { succeeded: number; failed: number }>();
      for (let offset = days - 1; offset >= 0; offset -= 1) {
        const day = new Date(now.getTime() - offset * 86_400_000).toISOString().slice(0, 10);
        perDay.set(day, { succeeded: 0, failed: 0 });
      }
      for (const row of byDay) {
        const day = new Date(row.day).toISOString().slice(0, 10);
        perDay.set(day, { succeeded: Number(row.succeeded), failed: Number(row.failed) });
      }

      return {
        window: { days, from: from.toISOString(), to: now.toISOString() },
        totals: {
          attempts,
          succeeded,
          failed: attempts - succeeded,
          lockedOut,
          uniqueUsers: byUser.length,
          uniqueIps: byIp.length,
        },
        byDay: [...perDay.entries()].map(([day, counts]) => ({ day, ...counts })),
        topFailingEmails: failingEmails.map((row) => ({ email: row.email, count: row._count._all })),
        topIps: topIps.map((row) => ({ ip: row.ip ?? "", count: row._count._all })),
        currentlyLocked: locked.map((user) => ({
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          lockedUntil: user.lockedUntil!.toISOString(),
          failedLoginAttempts: user.failedLoginAttempts,
        })),
        activeSessions,
      };
    });
  }

  async forUser(userId: string): Promise<UserLoginHistory> {
    const { clientId } = requireRequestContext();
    const now = new Date();

    return this.prisma.forClient(clientId!, async (tx) => {
      const user = await tx.user.findFirst({
        where: { id: userId, deletedAt: null },
        select: { id: true, fullName: true, email: true, isActive: true, lockedUntil: true },
      });
      if (!user) throw new NotFoundException("That user does not exist.");

      const [attempts, sessions] = await Promise.all([
        tx.loginAttempt.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: 50,
          select: ATTEMPT_SELECT,
        }) as Promise<AttemptRecord[]>,
        tx.session.findMany({
          where: { userId, revokedAt: null, absoluteExpiry: { gt: now }, idleExpiresAt: { gt: now } },
          orderBy: { createdAt: "desc" },
          select: { id: true, ip: true, userAgent: true, createdAt: true, idleExpiresAt: true },
        }),
      ]);

      return {
        user: { ...user, lockedUntil: user.lockedUntil?.toISOString() ?? null },
        attempts: await this.decorate(tx, attempts),
        activeSessions: sessions.map((session) => ({
          id: session.id,
          ip: session.ip,
          userAgent: session.userAgent,
          device: parseUserAgent(session.userAgent),
          createdAt: session.createdAt.toISOString(),
          idleExpiresAt: session.idleExpiresAt.toISOString(),
        })),
      };
    });
  }

  /** Joins users and sessions for a page of attempts, two queries for the lot. */
  private async decorate(
    tx: {
      user: { findMany: (args: unknown) => Promise<unknown[]> };
      session: { findMany: (args: unknown) => Promise<unknown[]> };
    },
    rows: AttemptRecord[],
  ): Promise<LoginAttemptRow[]> {
    const userIds = [...new Set(rows.map((row) => row.userId).filter((id): id is string => Boolean(id)))];
    const sessionIds = [...new Set(rows.map((row) => row.sessionId).filter((id): id is string => Boolean(id)))];
    const now = new Date();

    const [users, sessions] = await Promise.all([
      userIds.length
        ? (tx.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, fullName: true, email: true, isActive: true, lockedUntil: true },
          }) as Promise<
            Array<{ id: string; fullName: string; email: string; isActive: boolean; lockedUntil: Date | null }>
          >)
        : Promise.resolve([]),
      sessionIds.length
        ? (tx.session.findMany({
            where: { id: { in: sessionIds }, revokedAt: null, absoluteExpiry: { gt: now } },
            select: { id: true },
          }) as Promise<Array<{ id: string }>>)
        : Promise.resolve([]),
    ]);

    const userById = new Map(users.map((user) => [user.id, user]));
    const active = new Set(sessions.map((session) => session.id));

    return rows.map((row) => {
      const user = row.userId ? userById.get(row.userId) : undefined;
      return {
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        email: row.email,
        user: user
          ? { ...user, lockedUntil: user.lockedUntil?.toISOString() ?? null }
          : null,
        outcome: row.outcome as LoginOutcome,
        ip: row.ip,
        userAgent: row.userAgent,
        device: parseUserAgent(row.userAgent),
        host: row.host,
        sessionId: row.sessionId,
        sessionActive: row.sessionId ? active.has(row.sessionId) : false,
      };
    });
  }
}

export { LOGIN_OUTCOMES };

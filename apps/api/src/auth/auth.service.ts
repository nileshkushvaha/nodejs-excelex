import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { verifyPassword } from "@excelex/database";
import type { GrantSet } from "@excelex/permissions";

import { SecuritySettingsService } from "../settings/security-settings.service";
import { effectivePermissions, toGrantSet, type UserWithGrants } from "./grants";

import { PrismaService } from "../core/database/prisma.service";
import { SessionService } from "./session.service";

export interface AuthenticatedActor {
  readonly userId: string;
  readonly email: string;
  readonly fullName: string;
  /** Expanded against the catalogue, denials already applied. */
  readonly permissions: readonly string[];
  /** The raw grants, so a branch-scoped check can be re-resolved per record. */
  readonly grants: GrantSet;
  readonly branchIds: readonly string[];
}

export interface SignInResult {
  readonly actor: AuthenticatedActor;
  readonly token: string;
  readonly expiresAt: Date;
}

/**
 * Authentication for a client's staff. Platform administrators authenticate
 * elsewhere, against different tables, with mandatory MFA — they have no
 * clientId, so they physically cannot be stored here.
 */
/**
 * What every authentication query must load to answer "what may this person do?".
 * Named once so the two call sites cannot drift — a missing include here would
 * silently resolve to fewer permissions rather than fail.
 */
const GRANT_INCLUDE = {
  userRoles: { include: { role: { include: { rolePermissions: true } } } },
  userPermissions: true,
  memberships: true,
} as const;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
  ) {}

  /**
   * Signs in, or refuses and records why.
   *
   * Split into two transactions on purpose. Everything a client-scoped request
   * does runs inside a transaction, so throwing to reject a bad password would
   * roll back the failed-attempt counter written moments earlier — the counter
   * could never reach the lockout threshold, and the lockout would appear to
   * work while doing nothing. The verdict is computed first and committed
   * separately from the rejection.
   */
  async signIn(
    clientId: string,
    host: string,
    email: string,
    password: string,
    ip?: string,
    userAgent?: string,
  ): Promise<SignInResult> {
    const normalisedEmail = email.trim().toLowerCase();

    const verdict = await this.prisma.forClient(clientId, async (tx) => {
      const settings = SecuritySettingsService.toSettings(await tx.securitySettings.findFirst());

      const user = await tx.user.findFirst({
        where: { email: normalisedEmail, deletedAt: null },
        include: GRANT_INCLUDE,
      });

      // One failure message for every cause, and the password is verified even
      // when no user was found, so response timing does not reveal whether the
      // address exists. An enumerable login is how an attacker turns a password
      // spray into a targeted one.
      const passwordMatches = await verifyPassword(user?.passwordHash, password);
      const credentialsValid = Boolean(user && user.isActive && passwordMatches);

      return { settings, user, credentialsValid };
    });

    const { settings, user, credentialsValid } = verdict;

    if (!credentialsValid || !user) {
      if (user) await this.recordFailure(clientId, user, settings, ip, userAgent);

      this.logger.warn(`Failed sign-in for ${normalisedEmail} on ${host} from ${ip ?? "unknown"}`);
      throw new UnauthorizedException("Those sign-in details are not correct.");
    }

    // Lock state is revealed only once the password is known to be correct.
    // Announcing it earlier would confirm an address exists to anyone willing to
    // guess wrong five times, turning the lockout into an enumeration oracle —
    // the opposite of what it is for.
    const now = new Date();
    if (user.lockedUntil && user.lockedUntil > now) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 60_000);
      throw new UnauthorizedException(
        settings.lockoutMinutes === 0
          ? "This account is locked. An administrator must unlock it."
          : `This account is locked. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      );
    }

    const issued = this.sessions.issue(settings.idleTimeoutMinutes, settings.absoluteTimeoutHours);

    return this.prisma.forClient(clientId, async (tx) => {
      // Single-session mode: a new sign-in ends the others. Done before the new
      // session is written so the fresh one is never caught by its own sweep.
      if (!settings.allowMultipleSessions) {
        await tx.session.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: now },
        });
      }

      await tx.session.create({
        data: {
          clientId,
          userId: user.id,
          tokenHash: issued.tokenHash,
          host,
          ip: ip ?? null,
          userAgent: userAgent ?? null,
          idleExpiresAt: issued.idleExpiresAt,
          absoluteExpiry: issued.absoluteExpiry,
        },
      });

      await tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: now, failedLoginAttempts: 0, lockedUntil: null },
      });

      await tx.auditEvent.create({
        data: {
          clientId,
          actorId: user.id,
          action: "auth.session.created",
          entity: "session",
          ip: ip ?? null,
          userAgent: userAgent ?? null,
        },
      });

      return {
        actor: this.toActor(user),
        token: issued.token,
        expiresAt: issued.idleExpiresAt,
      };
    });
  }

  /**
   * Resolves a bearer cookie to an actor, sliding the idle window forward.
   *
   * Expiry is enforced here rather than relied upon from the cookie: the cookie's
   * own expiry is a client-side hint that a caller can simply not honour.
   */
  async authenticate(clientId: string, token: string): Promise<AuthenticatedActor | null> {
    const tokenHash = this.sessions.hash(token);
    const now = new Date();

    return this.prisma.forClient(clientId, async (tx) => {
      const settings = SecuritySettingsService.toSettings(await tx.securitySettings.findFirst());

      const session = await tx.session.findFirst({
        where: { tokenHash, revokedAt: null },
        include: { user: { include: GRANT_INCLUDE } },
      });

      if (!session) return null;
      if (!this.sessions.matches(tokenHash, session.tokenHash)) return null;
      if (session.idleExpiresAt <= now || session.absoluteExpiry <= now) return null;
      if (!session.user.isActive || session.user.deletedAt) return null;

      await tx.session.update({
        where: { id: session.id },
        data: { idleExpiresAt: this.sessions.nextIdleExpiry(settings.idleTimeoutMinutes) },
      });

      return this.toActor(session.user);
    });
  }

  async signOut(clientId: string, token: string, actorId?: string): Promise<void> {
    const tokenHash = this.sessions.hash(token);

    await this.prisma.forClient(clientId, async (tx) => {
      // Revoked, never deleted: the row is the evidence that the session existed
      // and when it ended, which is what an incident review needs.
      const { count } = await tx.session.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      if (count > 0) {
        await tx.auditEvent.create({
          data: {
            clientId,
            actorId: actorId ?? null,
            action: "auth.session.revoked",
            entity: "session",
          },
        });
      }
    });
  }

  /**
   * Counts a failed attempt and locks the account once the threshold is met.
   *
   * Runs in its own transaction, committed before the caller throws. A
   * lockoutMinutes of 0 means "until an administrator unlocks it", stored as a
   * far-future timestamp so one column answers the whole question rather than
   * two that can disagree.
   */
  private async recordFailure(
    clientId: string,
    user: { id: string; failedLoginAttempts: number },
    settings: { lockAfterFailedAttempts: boolean; maxFailedAttempts: number; lockoutMinutes: number },
    ip?: string,
    userAgent?: string,
  ): Promise<void> {
    const attempts = user.failedLoginAttempts + 1;
    const shouldLock = settings.lockAfterFailedAttempts && attempts >= settings.maxFailedAttempts;

    const lockedUntil = shouldLock
      ? settings.lockoutMinutes === 0
        ? new Date("9999-12-31T00:00:00Z")
        : new Date(Date.now() + settings.lockoutMinutes * 60_000)
      : null;

    await this.prisma.forClient(clientId, async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: attempts,
          lastFailedLoginAt: new Date(),
          ...(shouldLock ? { lockedUntil } : {}),
        },
      });

      await tx.auditEvent.create({
        data: {
          clientId,
          actorId: user.id,
          action: shouldLock ? "auth.account.locked" : "auth.signin.failed",
          entity: "user",
          entityId: user.id,
          metadata: { attempts, threshold: settings.maxFailedAttempts },
          ip: ip ?? null,
          userAgent: userAgent ?? null,
        },
      });
    });
  }

  private toActor(
    user: UserWithGrants & {
      id: string;
      email: string;
      fullName: string;
      memberships: Array<{ branchId: string }>;
    },
  ): AuthenticatedActor {
    const grants = toGrantSet(user);

    return {
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      permissions: effectivePermissions(grants),
      grants,
      branchIds: user.memberships.map((membership) => membership.branchId),
    };
  }
}

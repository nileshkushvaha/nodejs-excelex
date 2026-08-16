import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { verifyPassword } from "@excelex/database";
import type { GrantSet } from "@excelex/permissions";

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

  async signIn(
    clientId: string,
    host: string,
    email: string,
    password: string,
    ip?: string,
    userAgent?: string,
  ): Promise<SignInResult> {
    const normalisedEmail = email.trim().toLowerCase();

    return this.prisma.forClient(clientId, async (tx) => {
      const user = await tx.user.findFirst({
        where: { email: normalisedEmail, deletedAt: null },
        include: GRANT_INCLUDE,
      });

      // One failure message for every cause, and the password is verified even
      // when no user was found, so response timing does not reveal whether the
      // address exists. An enumerable login is how an attacker turns a password
      // spray into a targeted one.
      const passwordMatches = await verifyPassword(user?.passwordHash, password);

      if (!user || !user.isActive || !passwordMatches) {
        this.logger.warn(
          `Failed sign-in for ${normalisedEmail} on ${host} from ${ip ?? "unknown"}`,
        );
        throw new UnauthorizedException("Those sign-in details are not correct.");
      }

      const issued = this.sessions.issue();

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
        data: { lastLoginAt: new Date() },
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
        data: { idleExpiresAt: this.sessions.nextIdleExpiry() },
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

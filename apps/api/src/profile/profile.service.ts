import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { verifyPassword } from "@excelex/database";

import { ActorCache } from "../auth/actor-cache";
import { applyNewPassword } from "../auth/password-rules";
import { SessionService } from "../auth/session.service";
import { requireRequestContext } from "../core/context/request-context";
import { PrismaService } from "../core/database/prisma.service";
import { SecuritySettingsService } from "../settings/security-settings.service";

export interface ProfileView {
  id: string;
  email: string;
  fullName: string;
  lastLoginAt: string | null;
  createdAt: string;
  roles: string[];
  branches: Array<{ id: string; code: string; name: string }>;
}

export interface SessionView {
  id: string;
  host: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  idleExpiresAt: string;
  current: boolean;
}

/**
 * Everything a signed-in person may do to their own account.
 *
 * Deliberately separate from the user administration in AccessService: these
 * operations need no permission at all, because the subject and the actor are
 * the same person. Guarding them with settings.user.manage would mean an
 * operator could not change their own password.
 */
@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly actors: ActorCache,
  ) {}

  async view(): Promise<ProfileView> {
    const { clientId, actor } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const user = await tx.user.findFirstOrThrow({
        where: { id: actor!.userId },
        include: {
          userRoles: { include: { role: true } },
          memberships: { include: { branch: true } },
        },
      });

      return {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
        roles: [...new Set(user.userRoles.map((assignment) => assignment.role.name))].sort(),
        branches: user.memberships.map((membership) => ({
          id: membership.branch.id,
          code: membership.branch.code,
          name: membership.branch.name,
        })),
      };
    });
  }

  /**
   * Updates the parts of a profile the owner controls.
   *
   * The email address is not one of them. It is the identifier used to sign in
   * and the address invitations are sent to, so changing it is an account
   * recovery concern needing verification of the new address — not a text field.
   * An administrator changes it through user administration until that flow
   * exists.
   */
  async updateProfile(fullName: string): Promise<void> {
    const { clientId, actor } = requireRequestContext();

    await this.prisma.forClient(clientId!, async (tx) => {
      const before = await tx.user.findFirstOrThrow({ where: { id: actor!.userId } });
      if (before.fullName === fullName) return;

      await tx.user.update({ where: { id: actor!.userId }, data: { fullName } });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor!.userId,
          action: "profile.updated",
          entity: "user",
          entityId: actor!.userId,
          metadata: { fullName: { from: before.fullName, to: fullName } },
        },
      });
    });
  }

  /**
   * Changes the password and re-issues the session.
   *
   * The current password is required even though the caller is already
   * authenticated: without it, a stolen session becomes a stolen account, since
   * the thief could lock the owner out. This is the single check that keeps
   * session compromise recoverable.
   *
   * Every existing session is then revoked and a fresh one issued. A password
   * change is what someone does when they believe they have been compromised,
   * so leaving other sessions alive would defeat the reason they did it.
   */
  async changePassword(
    currentPassword: string,
    newPassword: string,
    currentToken: string,
  ): Promise<{ token: string; expiresAt: Date }> {
    const { clientId, actor, host, ip, userAgent } = requireRequestContext();

    if (currentPassword === newPassword) {
      throw new BadRequestException("The new password must be different from the current one.");
    }

    const issued = this.sessions.issue();

    await this.prisma.forClient(clientId!, async (tx) => {
      const user = await tx.user.findFirstOrThrow({ where: { id: actor!.userId } });

      if (!(await verifyPassword(user.passwordHash, currentPassword))) {
        throw new UnauthorizedException("That is not your current password.");
      }

      // The policy, the reuse rule and the history — the same code the reset
      // path runs, so neither door is weaker than the other.
      await applyNewPassword(tx, clientId!, user, newPassword);

      // Revoked rather than deleted: the rows are the evidence of what was
      // active at the moment of the change, which is what an incident review
      // needs afterwards.
      //
      // The current session is always replaced, because its token is reissued
      // below regardless. What the setting controls is whether the *other*
      // devices are ended too.
      const settings = SecuritySettingsService.toSettings(await tx.securitySettings.findFirst());

      await tx.session.updateMany({
        where: settings.forceLogoutOnPasswordChange
          ? { userId: user.id, revokedAt: null }
          : { userId: user.id, revokedAt: null, tokenHash: this.sessions.hash(currentToken) },
        data: { revokedAt: new Date() },
      });

      // The revoked sessions may still have cached actors. Dropping every
      // entry for this user is broader than needed and exactly right: the
      // cost is one re-read, and the alternative is reasoning about which
      // token hashes were in the updateMany.
      this.actors.forgetUser(user.id);

      await tx.session.create({
        data: {
          clientId: clientId!,
          userId: user.id,
          tokenHash: issued.tokenHash,
          host,
          ip: ip ?? null,
          userAgent: userAgent ?? null,
          idleExpiresAt: issued.idleExpiresAt,
          absoluteExpiry: issued.absoluteExpiry,
        },
      });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: user.id,
          action: "auth.password.changed",
          entity: "user",
          entityId: user.id,
          metadata: { otherSessionsRevoked: true },
          ip: ip ?? null,
          userAgent: userAgent ?? null,
        },
      });
    });

    return { token: issued.token, expiresAt: issued.idleExpiresAt };
  }

  async listSessions(currentToken: string | undefined): Promise<SessionView[]> {
    const { clientId, actor } = requireRequestContext();
    const currentHash = currentToken ? this.sessions.hash(currentToken) : null;
    const now = new Date();

    return this.prisma.forClient(clientId!, async (tx) => {
      const sessions = await tx.session.findMany({
        where: {
          userId: actor!.userId,
          revokedAt: null,
          idleExpiresAt: { gt: now },
          absoluteExpiry: { gt: now },
        },
        orderBy: { createdAt: "desc" },
      });

      return sessions.map((session) => ({
        id: session.id,
        host: session.host,
        ip: session.ip,
        userAgent: session.userAgent,
        createdAt: session.createdAt.toISOString(),
        idleExpiresAt: session.idleExpiresAt.toISOString(),
        current: session.tokenHash === currentHash,
      }));
    });
  }

  /** Signs out everywhere else, leaving this session alone. */
  async revokeOtherSessions(currentToken: string): Promise<number> {
    const { clientId, actor } = requireRequestContext();
    const currentHash = this.sessions.hash(currentToken);

    return this.prisma.forClient(clientId!, async (tx) => {
      const { count } = await tx.session.updateMany({
        where: { userId: actor!.userId, revokedAt: null, tokenHash: { not: currentHash } },
        data: { revokedAt: new Date() },
      });

      this.actors.forgetUser(actor!.userId);

      if (count > 0) {
        await tx.auditEvent.create({
          data: {
            clientId: clientId!,
            actorId: actor!.userId,
            action: "auth.sessions.revoked_others",
            entity: "user",
            entityId: actor!.userId,
            metadata: { count },
          },
        });
      }

      return count;
    });
  }
}

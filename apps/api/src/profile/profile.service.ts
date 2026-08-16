import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { hashPassword, verifyPassword } from "@excelex/database";
import { passwordViolations } from "@excelex/permissions";

import { SessionService } from "../auth/session.service";
import { requireRequestContext } from "../core/context/request-context";
import { PrismaService } from "../core/database/prisma.service";
import { PasswordPolicyService } from "../settings/password-policy.service";
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
    const newHash = await hashPassword(newPassword);

    await this.prisma.forClient(clientId!, async (tx) => {
      const policy = PasswordPolicyService.toPolicy(await tx.passwordPolicy.findFirst());

      // Every unmet rule at once. Refusing one rule at a time — too short, then
      // needs a digit, then needs a capital — is how people end up writing
      // passwords on a sticky note.
      const violations = passwordViolations(policy, newPassword);
      if (violations.length > 0) {
        throw new BadRequestException(
          violations.map((rule) => `Your password must contain: ${rule.toLowerCase()}`),
        );
      }

      const user = await tx.user.findFirstOrThrow({ where: { id: actor!.userId } });

      if (!(await verifyPassword(user.passwordHash, currentPassword))) {
        throw new UnauthorizedException("That is not your current password.");
      }

      if (policy.preventReuse) {
        const history = await tx.passwordHistory.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
          take: policy.historyCount,
        });

        // Argon2 salts every hash, so a reused password does not produce a
        // matching digest — each stored hash has to be verified in turn. That
        // cost is why historyCount is bounded rather than unlimited.
        for (const entry of history) {
          if (await verifyPassword(entry.passwordHash, newPassword)) {
            throw new BadRequestException(
              `That password was used recently. Choose one you have not used in your last ${policy.historyCount}.`,
            );
          }
        }
      }

      if (user.passwordHash) {
        await tx.passwordHistory.create({
          data: { clientId: clientId!, userId: user.id, passwordHash: user.passwordHash },
        });

        // Pruned to the policy: an unbounded list of someone's old credentials
        // is a liability that grows for as long as they work here.
        const stale = await tx.passwordHistory.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
          skip: policy.historyCount,
          select: { id: true },
        });
        if (stale.length > 0) {
          await tx.passwordHistory.deleteMany({ where: { id: { in: stale.map((row) => row.id) } } });
        }
      }

      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash: newHash, passwordChangedAt: new Date() },
      });

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

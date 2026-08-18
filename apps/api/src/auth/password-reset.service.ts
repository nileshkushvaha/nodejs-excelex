import { Inject, Injectable, Logger } from "@nestjs/common";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

import { ActorCache } from "./actor-cache";
import { applyNewPassword } from "./password-rules";
import { CacheService } from "../core/cache/cache.service";
import { ENVIRONMENT, type Environment } from "../core/config/environment";
import { requireRequestContext } from "../core/context/request-context";
import { PrismaService } from "../core/database/prisma.service";
import { AppError, RateLimitedError } from "../core/errors/app-error";
import { MailService } from "../core/mail/mail.service";
import { logEvent } from "../core/observability/log-event";
import { RateLimiterService } from "../core/rate-limit/rate-limiter.service";
import { SecuritySettingsService } from "../settings/security-settings.service";

/**
 * Resetting a forgotten password with a mailed one-time code.
 *
 * Three steps, each its own request, none of which says whether an address
 * exists:
 *
 *   request  — always "if that address has an account, a code is on its
 *              way"; a code is generated, hashed and mailed only when it is.
 *   verify   — the code against the newest open attempt; wrong answers are
 *              counted and the attempt dies after five, so a six-digit code
 *              is safe despite its size. Success issues a long random reset
 *              token for the final step, so the code is never reused.
 *   complete — the token, a new password under the client's policy, every
 *              session revoked, any lockout cleared (a person who has proved
 *              control of the mailbox is the account's owner), and a
 *              confirmation mailed to the same address.
 *
 * Throttled per address and per email under the client's own
 * `resetThrottleEnabled` switch — a reset request is a free email to any
 * address you name, and that is worth slowing down. Every step is audited.
 */
const CODE_TTL_MS = 10 * 60 * 1000;
const TOKEN_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const REQUEST_LIMIT_PER_IP = { limit: 5, windowSeconds: 900 };
const REQUEST_LIMIT_PER_EMAIL = { limit: 3, windowSeconds: 900 };
const VERIFY_LIMIT_PER_IP = { limit: 20, windowSeconds: 900 };

const NEUTRAL_MESSAGE = "If that address has an account, a code is on its way. It expires in 10 minutes.";
const BAD_CODE_MESSAGE = "That code is not correct or has expired. Request a new one if you need to.";

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    @Inject(ENVIRONMENT) private readonly environment: Environment,
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly limiter: RateLimiterService,
    private readonly cache: CacheService,
    private readonly actors: ActorCache,
  ) {}

  async request(rawEmail: string): Promise<{ message: string }> {
    const { clientId, host, ip, userAgent, requestId } = requireRequestContext();
    const email = rawEmail.trim().toLowerCase();

    await this.throttle(clientId!, `reset:request:ip:${ip ?? "unknown"}`, REQUEST_LIMIT_PER_IP, true);
    await this.throttle(clientId!, `reset:request:email:${clientId}:${email}`, REQUEST_LIMIT_PER_EMAIL, false);

    const user = await this.prisma.forClient(clientId!, async (tx) =>
      tx.user.findFirst({ where: { email, deletedAt: null, isActive: true }, select: { id: true, fullName: true, email: true } }),
    );

    if (user) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      const salt = randomBytes(16).toString("hex");
      const now = new Date();

      await this.prisma.forClient(clientId!, async (tx) => {
        // One live attempt per person: a new request supersedes the old.
        await tx.passwordReset.updateMany({
          where: { userId: user.id, consumedAt: null, cancelledAt: null },
          data: { cancelledAt: now },
        });
        await tx.passwordReset.create({
          data: {
            clientId: clientId!,
            userId: user.id,
            email,
            codeHash: hashCode(code, salt),
            codeSalt: salt,
            maxAttempts: MAX_ATTEMPTS,
            expiresAt: new Date(now.getTime() + CODE_TTL_MS),
            ip: ip ?? null,
            userAgent: userAgent ?? null,
            requestId,
          },
        });
        await tx.auditEvent.create({
          data: {
            clientId: clientId!,
            actorId: user.id,
            action: "auth.password_reset.requested",
            entity: "user",
            entityId: user.id,
            ip: ip ?? null,
            userAgent: userAgent ?? null,
            requestId,
          },
        });
      });

      const senderName = await this.senderName(clientId!);
      await this.mail.send({
        clientId: clientId!,
        to: { email: user.email, name: user.fullName },
        template: "auth.password_reset",
        reference: { type: "user", id: user.id },
        content: {
          subject: `${code} is your ${senderName} password reset code`,
          title: "Reset your password",
          paragraphs: [
            `Hello ${user.fullName.split(" ")[0]},`,
            "Somebody — hopefully you — asked to reset the password for this account. Enter this code on the reset screen:",
            code,
            "If you did not ask for this, you can ignore this message; nothing changes until the code is used, and it stops working in 10 minutes.",
          ],
          note: `Requested from ${host}${ip ? ` (${ip})` : ""}.`,
        },
      });
    } else {
      // The same delay a real request costs, so the answer's timing does not
      // say whether the address exists.
      await new Promise((resolve) => setTimeout(resolve, 150 + randomInt(0, 100)));
      logEvent(this.logger, "debug", "auth.password_reset.unknown_email", { host });
    }

    return { message: NEUTRAL_MESSAGE };
  }

  async verify(rawEmail: string, code: string): Promise<{ resetToken: string; expiresInSeconds: number }> {
    const { clientId, ip, userAgent, requestId } = requireRequestContext();
    const email = rawEmail.trim().toLowerCase();
    await this.throttle(clientId!, `reset:verify:ip:${ip ?? "unknown"}`, VERIFY_LIMIT_PER_IP, true);

    const now = new Date();
    const attempt = await this.prisma.forClient(clientId!, async (tx) =>
      tx.passwordReset.findFirst({
        where: { email, consumedAt: null, cancelledAt: null, verifiedAt: null },
        orderBy: { createdAt: "desc" },
      }),
    );

    if (!attempt || attempt.expiresAt < now || attempt.attempts >= attempt.maxAttempts) {
      // Verify against a throwaway hash so the timing matches a real check.
      hashCode(code, "0".repeat(32));
      throw new AppError(400, "reset_code_invalid", BAD_CODE_MESSAGE);
    }

    const matches = safeEqual(hashCode(code, attempt.codeSalt), attempt.codeHash);
    if (!matches) {
      const attempts = attempt.attempts + 1;
      await this.prisma.forClient(clientId!, async (tx) => {
        await tx.passwordReset.update({
          where: { id: attempt.id },
          data: { attempts, ...(attempts >= attempt.maxAttempts ? { cancelledAt: now } : {}) },
        });
        if (attempts >= attempt.maxAttempts) {
          await tx.auditEvent.create({
            data: {
              clientId: clientId!,
              actorId: attempt.userId,
              action: "auth.password_reset.exhausted",
              entity: "user",
              entityId: attempt.userId,
              metadata: { attempts },
              ip: ip ?? null,
              userAgent: userAgent ?? null,
              requestId,
            },
          });
        }
      });
      throw new AppError(400, "reset_code_invalid", BAD_CODE_MESSAGE);
    }

    const resetToken = randomBytes(32).toString("base64url");
    await this.prisma.forClient(clientId!, async (tx) => {
      await tx.passwordReset.update({
        where: { id: attempt.id },
        data: {
          verifiedAt: now,
          resetTokenHash: sha256(resetToken),
          // The token's own life starts now; the code's is over.
          expiresAt: new Date(now.getTime() + TOKEN_TTL_MS),
        },
      });
    });
    return { resetToken, expiresInSeconds: TOKEN_TTL_MS / 1000 };
  }

  async complete(rawEmail: string, resetToken: string, newPassword: string): Promise<{ message: string }> {
    const { clientId, ip, userAgent, requestId } = requireRequestContext();
    const email = rawEmail.trim().toLowerCase();
    const now = new Date();

    const attempt = await this.prisma.forClient(clientId!, async (tx) =>
      tx.passwordReset.findFirst({
        where: { email, consumedAt: null, cancelledAt: null, verifiedAt: { not: null }, resetTokenHash: sha256(resetToken) },
        orderBy: { createdAt: "desc" },
      }),
    );
    if (!attempt || attempt.expiresAt < now) {
      throw new AppError(400, "reset_token_invalid", "This reset has expired or was already used. Start again from the sign-in screen.");
    }

    let userForMail: { email: string; fullName: string } | null = null;
    await this.prisma.forClient(clientId!, async (tx) => {
      const user = await tx.user.findFirstOrThrow({ where: { id: attempt.userId } });
      await applyNewPassword(tx, clientId!, user, newPassword);

      // The account is theirs again: the lock is cleared and every session
      // — including the one whoever locked them out may hold — is ended.
      await tx.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null, isActive: true },
      });
      await tx.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } });
      await tx.passwordReset.update({ where: { id: attempt.id }, data: { consumedAt: now } });
      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: user.id,
          action: "auth.password_reset.completed",
          entity: "user",
          entityId: user.id,
          metadata: { sessionsRevoked: true, lockCleared: true },
          ip: ip ?? null,
          userAgent: userAgent ?? null,
          requestId,
        },
      });
      userForMail = { email: user.email, fullName: user.fullName };
    });
    this.actors.forgetUser(attempt.userId);

    if (userForMail) {
      const { email: to, fullName } = userForMail as { email: string; fullName: string };
      const senderName = await this.senderName(clientId!);
      await this.mail.send({
        clientId: clientId!,
        to: { email: to, name: fullName },
        template: "auth.password_changed",
        reference: { type: "user", id: attempt.userId },
        content: {
          subject: `Your ${senderName} password was changed`,
          title: "Your password was changed",
          paragraphs: [
            `Hello ${fullName.split(" ")[0]},`,
            "The password for your account was just reset, and every other signed-in device has been signed out.",
            "If this was you, there is nothing to do. If it was not, contact your administrator straight away — this message is the signal to act on.",
          ],
          note: `Changed from ${ip ?? "an unknown address"} at ${now.toISOString()}.`,
        },
      });
    }

    return { message: "Your password has been reset. Sign in with the new one." };
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private async throttle(
    clientId: string,
    bucket: string,
    limit: { limit: number; windowSeconds: number },
    always: boolean,
  ): Promise<void> {
    if (!always && !(await this.clientThrottles(clientId))) return;
    const verdict = await this.limiter.consume(bucket, limit.limit, limit.windowSeconds);
    if (!verdict.allowed) {
      throw new RateLimitedError(verdict.resetSeconds, "Too many reset requests. Wait a while and try again.");
    }
  }

  private async clientThrottles(clientId: string): Promise<boolean> {
    const settings = await this.cache.getOrSet({ clientId }, "settings", "security", () =>
      this.prisma.forClient(clientId, async (tx) => {
        const row = await tx.securitySettings.findFirst();
        return { ...SecuritySettingsService.toSettings(row), updatedAt: row?.updatedAt.toISOString() ?? null };
      }),
    );
    return settings.resetThrottleEnabled;
  }

  private async senderName(clientId: string): Promise<string> {
    const settings = await this.prisma.forClient(clientId, async (tx) => tx.clientSettings.findFirst());
    return settings?.tradingName || settings?.legalName || this.environment.MAIL_FROM_NAME;
  }
}

function hashCode(code: string, salt: string): string {
  return sha256(`${salt}:${code}`);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

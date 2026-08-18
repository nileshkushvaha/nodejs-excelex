import { Inject, Injectable } from "@nestjs/common";

import { CacheService } from "../core/cache/cache.service";
import { ENVIRONMENT, type Environment } from "../core/config/environment";
import { PrismaService } from "../core/database/prisma.service";
import { RateLimitedError } from "../core/errors/app-error";
import { RateLimiterService } from "../core/rate-limit/rate-limiter.service";
import { SecuritySettingsService } from "../settings/security-settings.service";
import { LoginHistoryService } from "../system/login-history/login-history.service";

/**
 * Slowing a password spray before it costs a hash.
 *
 * Two counters, for two attacks. Per address catches one machine trying
 * many accounts; per email catches many machines trying one account — and
 * also covers addresses that do not exist, which the lockout never can,
 * because there is no account to lock. Both run before the password is
 * looked at, so a spray costs the attacker a round trip and us an INCR.
 *
 * The per-address limit is a deployment setting (LOGIN_RATE_LIMIT_PER_IP):
 * it protects the service, and one client should not be able to switch it
 * off for everyone. The per-email limit is the client's own switch — the
 * `loginThrottleEnabled` setting their security screen has offered since
 * before it was enforced — because it is their staff who feel it.
 *
 * A refused attempt is written to login history as THROTTLED, so a blocked
 * spray shows on the Login History screen as what it was rather than as
 * silence. The response is a 429 with Retry-After, and it says nothing about
 * whether the address exists.
 */
const IP_WINDOW_SECONDS = 60;
const EMAIL_WINDOW_SECONDS = 300;

@Injectable()
export class LoginThrottleService {
  constructor(
    @Inject(ENVIRONMENT) private readonly environment: Environment,
    private readonly limiter: RateLimiterService,
    private readonly cache: CacheService,
    private readonly prisma: PrismaService,
    private readonly history: LoginHistoryService,
  ) {}

  /** Throws RateLimitedError when this attempt should not be looked at. */
  async assertAllowed(input: {
    clientId: string;
    host: string;
    email: string;
    ip?: string;
    userAgent?: string;
  }): Promise<void> {
    const email = input.email.trim().toLowerCase();

    const perIp = this.environment.LOGIN_RATE_LIMIT_PER_IP;
    if (perIp > 0 && input.ip) {
      const verdict = await this.limiter.consume(`login:ip:${input.ip}`, perIp, IP_WINDOW_SECONDS);
      if (!verdict.allowed) return this.refuse(input, email, verdict.resetSeconds);
    }

    const perEmail = this.environment.LOGIN_RATE_LIMIT_PER_EMAIL;
    if (perEmail > 0 && (await this.clientThrottles(input.clientId))) {
      const verdict = await this.limiter.consume(
        `login:email:${input.clientId}:${email}`,
        perEmail,
        EMAIL_WINDOW_SECONDS,
      );
      if (!verdict.allowed) return this.refuse(input, email, verdict.resetSeconds);
    }
  }

  /** The client's switch, read through the same cache the settings screen uses. */
  private async clientThrottles(clientId: string): Promise<boolean> {
    const settings = await this.cache.getOrSet({ clientId }, "settings", "security", () =>
      this.prisma.forClient(clientId, async (tx) => {
        const row = await tx.securitySettings.findFirst();
        return { ...SecuritySettingsService.toSettings(row), updatedAt: row?.updatedAt.toISOString() ?? null };
      }),
    );
    return settings.loginThrottleEnabled;
  }

  private async refuse(
    input: { clientId: string; host: string; ip?: string; userAgent?: string },
    email: string,
    retryAfterSeconds: number,
  ): Promise<never> {
    await this.history.record(input.clientId, {
      userId: null,
      email,
      outcome: "THROTTLED",
      host: input.host,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });
    throw new RateLimitedError(
      retryAfterSeconds,
      "Too many sign-in attempts. Wait a moment and try again.",
    );
  }
}

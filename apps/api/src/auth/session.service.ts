import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import type { CookieOptions, Response } from "express";

import { ENVIRONMENT, type Environment } from "../core/config/environment";

export interface IssuedSession {
  readonly token: string;
  readonly tokenHash: string;
  readonly idleExpiresAt: Date;
  readonly absoluteExpiry: Date;
}

/**
 * Opaque server-side sessions, not JWTs.
 *
 * Revocation has to be immediate and total — when a client deactivates staff,
 * when ExcelEx suspends a client, during incident response — and a stateless
 * token cannot be revoked, only outlived. The cost is a database read per
 * request, which is the same read the authorization check needs anyway.
 */
@Injectable()
export class SessionService {
  constructor(@Inject(ENVIRONMENT) private readonly environment: Environment) {}

  /**
   * 32 random bytes, returned once to the caller and stored only as a SHA-256
   * hash. A database read therefore does not yield a usable session — a backup,
   * a replica or a support query cannot be turned into someone's login.
   *
   * SHA-256 rather than Argon2 deliberately: the token is 256 bits of entropy
   * from a CSPRNG, so there is no low-entropy secret to slow a guesser down,
   * and the hash is computed on every authenticated request.
   */
  issue(): IssuedSession {
    const token = randomBytes(32).toString("base64url");
    const now = Date.now();

    return {
      token,
      tokenHash: this.hash(token),
      idleExpiresAt: new Date(now + this.environment.SESSION_IDLE_MINUTES * 60_000),
      absoluteExpiry: new Date(now + this.environment.SESSION_ABSOLUTE_HOURS * 3_600_000),
    };
  }

  hash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  /** Constant-time comparison, so a lookup cannot be turned into a timing oracle. */
  matches(candidateHash: string, storedHash: string): boolean {
    const a = Buffer.from(candidateHash, "hex");
    const b = Buffer.from(storedHash, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  }

  nextIdleExpiry(): Date {
    return new Date(Date.now() + this.environment.SESSION_IDLE_MINUTES * 60_000);
  }

  get cookieName(): string {
    return this.environment.SESSION_COOKIE_NAME;
  }

  /**
   * The __Host- prefix is the actual isolation mechanism between clients, and it
   * is enforced by the browser rather than by us: it refuses the cookie unless
   * it is Secure, Path=/ and carries no Domain attribute, which makes the cookie
   * host-only by construction.
   *
   * SameSite provides no protection here. All client hosts share one registrable
   * domain, so they are same-site with each other; SameSite=Lax defends against
   * third-party sites, not against another client. Cross-client CSRF is
   * mitigated by explicit origin verification instead.
   *
   * `secure: true` on plain http://localhost is intentional and works —
   * browsers treat localhost as a secure context.
   */
  cookieOptions(expiresAt: Date): CookieOptions {
    return {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    };
  }

  write(response: Response, token: string, expiresAt: Date): void {
    response.cookie(this.cookieName, token, this.cookieOptions(expiresAt));
  }

  clear(response: Response): void {
    response.clearCookie(this.cookieName, { httpOnly: true, secure: true, sameSite: "lax", path: "/" });
  }
}

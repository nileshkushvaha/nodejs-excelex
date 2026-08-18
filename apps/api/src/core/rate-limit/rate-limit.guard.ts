import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request, Response } from "express";

import { ENVIRONMENT, type Environment } from "../config/environment";
import { currentRequestContext } from "../context/request-context";
import { RateLimitedError } from "../errors/app-error";
import { RATE_LIMIT_KEY, type RateLimitOptions } from "./rate-limit.decorator";
import { RateLimiterService } from "./rate-limiter.service";

/**
 * The request-rate ceiling, applied before authentication.
 *
 * Every route gets the global per-address limit from the environment; a
 * route may name a tighter (or looser, or no) limit with @RateLimit(). The
 * verdict is written back as the IETF draft headers — RateLimit-Limit,
 * RateLimit-Remaining, RateLimit-Reset — on every response, and a refusal is
 * a 429 with Retry-After, through the same envelope as every other error.
 *
 * Runs first among the guards so a flood of unauthenticated requests is
 * refused before it costs a session lookup. That is also why the default
 * subject is the address: nothing else is known yet.
 *
 * The address is `request.ip`, which is only the real client when Express
 * is told how many proxies to trust — see TRUST_PROXY_HOPS in main.ts.
 * Behind an untrusted proxy every user shares the proxy's address and the
 * global limit is effectively per-deployment; the default is generous for
 * that reason.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimiterService,
    @Inject(ENVIRONMENT) private readonly environment: Environment,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== "http") return true;

    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const limit = options?.limit ?? this.environment.RATE_LIMIT_PER_MINUTE;
    if (!limit) return true; // 0 disables — per route or globally.
    const windowSeconds = options?.windowSeconds ?? 60;

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const subject = this.subject(request, options?.subject ?? "ip");
    if (!subject) return true; // An actor limit on an anonymous request: nothing to count yet.

    const bucket = `${options?.bucket ?? routeBucket(request)}:${subject}`;
    const verdict = await this.limiter.consume(bucket, limit, windowSeconds);

    response.setHeader("RateLimit-Limit", String(verdict.limit));
    response.setHeader("RateLimit-Remaining", String(verdict.remaining));
    response.setHeader("RateLimit-Reset", String(verdict.resetSeconds));

    if (!verdict.allowed) throw new RateLimitedError(verdict.resetSeconds);
    return true;
  }

  private subject(request: Request, kind: "ip" | "actor"): string | null {
    if (kind === "actor") {
      const actor = currentRequestContext()?.actor;
      return actor ? `actor:${actor.userId}` : null;
    }
    return `ip:${request.ip ?? "unknown"}`;
  }
}

/** The route pattern when known, else the method — never the raw URL. */
function routeBucket(request: Request): string {
  const path = (request as { route?: { path?: unknown } }).route?.path;
  return typeof path === "string" ? `${request.method}:${request.baseUrl ?? ""}${path}` : "global";
}

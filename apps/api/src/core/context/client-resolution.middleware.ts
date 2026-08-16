import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NestMiddleware,
  HttpException,
  HttpStatus,
  NotFoundException,
} from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

import { ENVIRONMENT, type Environment } from "../config/environment";
import { PrismaService } from "../database/prisma.service";
import { runWithRequestContext, type RequestContext } from "./request-context";

/**
 * Resolves the client from the trusted host and seals the request context.
 *
 * This is the top of the enforcement chain: everything downstream — guards,
 * services, the Prisma extension, RLS — reads the identity established here and
 * has no way to establish its own. Get this wrong and every barrier below it is
 * protecting the wrong client correctly.
 */
@Injectable()
export class ClientResolutionMiddleware implements NestMiddleware {
  constructor(
    @Inject(ENVIRONMENT) private readonly environment: Environment,
    private readonly prisma: PrismaService,
  ) {}

  async use(request: Request, response: Response, next: NextFunction): Promise<void> {
    const host = this.resolveHost(request);
    this.rejectCallerSuppliedClientId(request);

    const requestId = randomUUID();
    response.setHeader("x-request-id", requestId);

    const base: Omit<RequestContext, "hostKind"> = {
      requestId,
      host,
      ip: request.ip,
      userAgent: request.get("user-agent"),
      startedAt: new Date(),
    };

    if (host === `admin.${this.environment.APP_BASE_DOMAIN}`) {
      return runWithRequestContext({ ...base, hostKind: "platform" }, () => next());
    }

    const resolved = await this.prisma.resolveHost(host);

    if (!resolved) {
      // A host inside our domain that maps to no client is indistinguishable
      // from one that maps to a client the caller may not know about, so both
      // are 404. Anything else is a client-enumeration oracle.
      throw new NotFoundException("Unknown host.");
    }

    this.assertServable(resolved.status);

    return runWithRequestContext(
      { ...base, hostKind: "client", clientId: resolved.clientId, clientStatus: resolved.status },
      () => next(),
    );
  }

  /**
   * The host comes from the trusted header only where a proxy we control sets
   * it, and from the connection's Host header otherwise. X-Forwarded-Host has no
   * hop semantics and is forgeable by any caller, so believing it without a
   * trusted proxy in front is a client-takeover vector, not a convenience.
   */
  private resolveHost(request: Request): string {
    const forwarded = this.environment.TRUST_PROXY_HEADERS
      ? request.get("x-forwarded-host")?.split(",")[0]?.trim()
      : undefined;

    const raw = (forwarded ?? request.get("host") ?? "").toLowerCase();
    const host = raw.replace(/:\d+$/, "");

    const base = this.environment.APP_BASE_DOMAIN.toLowerCase();
    if (host !== base && !host.endsWith(`.${base}`)) {
      throw new NotFoundException("Unknown host.");
    }

    return host;
  }

  /**
   * A clientId in a body, query string or client-set header is a validation
   * error, not something to ignore. A correct caller never sends one, so its
   * presence means either a bug that would otherwise fail silently or a probe.
   */
  private rejectCallerSuppliedClientId(request: Request): void {
    const suspect =
      "clientId" in request.query ||
      "client_id" in request.query ||
      request.get("x-client-id") !== undefined ||
      (typeof request.body === "object" &&
        request.body !== null &&
        ("clientId" in request.body || "client_id" in request.body));

    if (suspect) {
      throw new BadRequestException(
        "A client identifier may not be supplied by the caller. It is derived from the host.",
      );
    }
  }

  private assertServable(status: string): void {
    switch (status) {
      case "ACTIVE":
      case "TRIAL":
        return;
      case "EXPIRED":
        throw new HttpException("This subscription has expired.", HttpStatus.PAYMENT_REQUIRED);
      default:
        // SUSPENDED and CLOSED
        throw new ForbiddenException("This account is not currently available.");
    }
  }
}

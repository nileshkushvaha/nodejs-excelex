import { ForbiddenException } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

import type { Environment } from "../config/environment";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF mitigation by explicit origin verification.
 *
 * `SameSite` is the usual answer and it does nothing here: every client host
 * shares the registrable domain, so acme.excelex.in and globex.excelex.in are
 * same-site with each other. A form on one client's page posting to another's
 * API is a same-site request that SameSite=Lax happily allows. Only checking
 * that the declared origin is the exact host being addressed separates them.
 *
 * Sec-Fetch-Site is checked first where the browser sends it, because it cannot
 * be set by page script; Origin is the fallback for older clients.
 */
export class OriginCheckMiddleware {
  constructor(private readonly environment: Environment) {}

  handler() {
    return (request: Request, response: Response, next: NextFunction): void => {
      if (SAFE_METHODS.has(request.method)) return next();

      const origin = request.get("origin");

      // No Origin at all: a non-browser caller such as curl or a server-to-server
      // client. Those are not subject to CSRF, which is a browser-ambient-credential
      // problem — the cookie is only attached automatically by a browser.
      if (!origin) return next();

      const allowed = new Set([this.environment.WEB_ORIGIN]);
      const host = request.get("x-forwarded-host") ?? request.get("host");
      if (host) {
        allowed.add(`http://${host}`);
        allowed.add(`https://${host}`);
      }

      if (!allowed.has(origin)) {
        throw new ForbiddenException("Cross-origin request rejected.");
      }

      return next();
    };
  }
}

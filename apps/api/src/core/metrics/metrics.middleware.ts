import type { NextFunction, Request, Response } from "express";

import type { MetricsService } from "./metrics.service";

/**
 * Times every HTTP request and files it under its route pattern.
 *
 * A plain Express function rather than a Nest interceptor, because an
 * interceptor only sees requests that reach a handler: a 404, a guard
 * rejection or a middleware throw never gets there, and those are exactly the
 * requests an error-rate figure must include. Hooked on the response's
 * `finish` event so the duration covers writing the body, not just computing
 * it.
 *
 * The label is `req.route.path` — the pattern Express matched, with the
 * parameters unfilled — never the URL. A URL carries ids, and ids in a label
 * are unbounded cardinality and, occasionally, data. A request that matched no
 * route is "unmatched".
 */
export function metricsMiddleware(metrics: MetricsService) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const started = process.hrtime.bigint();
    metrics.requestStarted();

    response.once("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
      metrics.observeRequest({
        method: request.method,
        route: routePattern(request),
        status: response.statusCode,
        durationMs,
      });
    });

    next();
  };
}

function routePattern(request: Request): string {
  const route: { path?: unknown } | undefined = (request as { route?: { path?: unknown } }).route;
  const path: unknown = route?.path;
  if (typeof path !== "string" || path.length === 0) return "unmatched";
  return `${request.baseUrl ?? ""}${path}`;
}

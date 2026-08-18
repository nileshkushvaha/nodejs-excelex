import type { Instrumentation } from "next";

import { decodeDigest } from "@/lib/api-error";

/**
 * Server-side error reporting for the web app.
 *
 * The API reports its own failures; what this catches is the web server's
 * — a server component that threw, a server action that failed for a
 * reason other than the API saying no. Off unless SENTRY_DSN is set. The
 * SDK is imported lazily inside `register()` so a deployment without a
 * DSN never loads it, and the Node SDK is only loaded in the Node runtime.
 *
 * An outage the API already reported (an ApiUnavailableError, recognisable
 * by its digest) is not reported again from here: one incident, one alert.
 */
let sentry: typeof import("@sentry/node") | null = null;

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.SENTRY_DSN) return;
  sentry = await import("@sentry/node");
  sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    defaultIntegrations: false,
  });
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (!sentry) return;
  const digest = typeof error === "object" && error !== null && "digest" in error ? String(error.digest) : undefined;
  const decoded = decodeDigest(digest);
  if (decoded) return; // The API's failure, already reported by the API under this reference.

  sentry.withScope((scope) => {
    scope.setTag("event", "web.request_error");
    scope.setTag("routerKind", context.routerKind);
    scope.setTag("routeType", context.routeType);
    scope.setTag("routePath", context.routePath);
    if (digest) scope.setTag("digest", digest);
    scope.setContext("request", { method: request.method, path: request.path });
    sentry!.captureException(error);
  });
  await sentry.flush(2_000);
};

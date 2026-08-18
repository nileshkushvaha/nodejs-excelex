import * as Sentry from "@sentry/node";

import type { ErrorReporterPort, ReportContext } from "./error-reporter";
import { redact } from "./redact";

/**
 * The Sentry adapter.
 *
 * Deliberately narrow: `Sentry.init` with PII sending off, no automatic
 * request-body or header capture, and every event passed through the same
 * redaction as the log before it leaves. Tracing is opt-in and off by
 * default — it is a cost decision, and it is not what this adapter is for.
 * The correlation is carried as tags, so a report can be searched by the
 * same requestId a person quoted from the screen.
 */
export interface SentryOptions {
  readonly dsn: string;
  readonly environment: string;
  readonly release?: string;
  readonly tracesSampleRate?: number;
}

export function createSentryReporter(options: SentryOptions): ErrorReporterPort {
  Sentry.init({
    dsn: options.dsn,
    environment: options.environment,
    release: options.release,
    sendDefaultPii: false,
    tracesSampleRate: options.tracesSampleRate ?? 0,
    // Nest and Express are instrumented by hand through the filter; the
    // automatic integrations would double-report and capture bodies.
    defaultIntegrations: false,
    integrations: [Sentry.onUnhandledRejectionIntegration({ mode: "none" })],
    beforeSend(event) {
      if (event.request) {
        // Whatever the SDK gathered about the request is more than we send.
        delete event.request.data;
        delete event.request.headers;
        delete event.request.cookies;
      }
      if (event.extra) event.extra = redact(event.extra);
      if (event.user) event.user = { id: event.user.id };
      return event;
    },
  });

  const scoped = (context: ReportContext, run: (scope: Sentry.Scope) => void) => {
    Sentry.withScope((scope) => {
      scope.setTag("event", context.event);
      if (context.requestId) scope.setTag("requestId", context.requestId);
      if (context.clientId) scope.setTag("clientId", context.clientId);
      if (context.route) scope.setTag("route", context.route);
      if (context.code) scope.setTag("code", context.code);
      if (context.status) scope.setTag("status", String(context.status));
      if (context.actorId) scope.setUser({ id: context.actorId });
      if (context.extra) scope.setContext("detail", redact(context.extra));
      // Grouped by the stable code first: a hundred `database_unavailable`
      // are one problem, not a hundred.
      if (context.code) scope.setFingerprint([context.event, context.code, "{{ default }}"]);
      run(scope);
    });
  };

  return {
    enabled: true,
    captureException(error, context) {
      scoped(context, () => Sentry.captureException(error instanceof Error ? error : new Error(String(error))));
    },
    captureMessage(message, context, level = "error") {
      scoped(context, () => Sentry.captureMessage(message, level));
    },
    flush(timeoutMs) {
      return Sentry.flush(timeoutMs).then(() => undefined);
    },
  };
}

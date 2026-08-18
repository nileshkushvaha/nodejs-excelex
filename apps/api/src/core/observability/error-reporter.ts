import { Injectable, Logger } from "@nestjs/common";

import { currentRequestContext } from "../context/request-context";
import { redact } from "./redact";

/**
 * Where a failure goes besides the log.
 *
 * The log is the durable record and the reference is how a person finds a
 * line in it. A reporter is the thing that notices: it groups the same
 * failure across a thousand requests, alerts when a new one appears, and
 * shows the release it started in. Sentry is the adapter shipped here; the
 * interface is what the rest of the code depends on, so swapping the vendor
 * touches one file and no callers.
 *
 * What is reported: server-side failures (5xx), job and scheduler failures,
 * and process-level fatals — the things somebody should look at. What is
 * not: 4xx refusals, which are the client's doing and are counted rather
 * than reported. What is attached: the same correlation as the log line
 * (requestId, clientId, actorId), the route and the code — never the body,
 * never a header, never an email. Everything passes through the same
 * redaction as the log.
 *
 * Off unless SENTRY_DSN is set. The no-op is the default so a deployment
 * without a reporter behaves exactly like one with, minus the alerts.
 */
export interface ReportContext {
  /** A stable name for the kind of event, matching the log event. */
  readonly event: string;
  readonly requestId?: string;
  readonly clientId?: string;
  readonly actorId?: string;
  readonly route?: string;
  readonly code?: string;
  readonly status?: number;
  /** Anything else worth seeing on the report; redacted first. */
  readonly extra?: Record<string, unknown>;
}

export interface ErrorReporterPort {
  readonly enabled: boolean;
  captureException(error: unknown, context: ReportContext): void;
  /** For deliberate reports with no exception object — a fatal condition, a threshold. */
  captureMessage(message: string, context: ReportContext, level?: "fatal" | "error" | "warning"): void;
  /** Lets in-flight reports leave before the process exits. */
  flush(timeoutMs: number): Promise<void>;
}

/** The context every report gets from the request, when there is one. */
export function requestReportContext(): Pick<ReportContext, "requestId" | "clientId" | "actorId"> {
  const context = currentRequestContext();
  return context
    ? { requestId: context.requestId, clientId: context.clientId, actorId: context.actor?.userId }
    : {};
}

@Injectable()
export class ErrorReporter implements ErrorReporterPort {
  private readonly logger = new Logger(ErrorReporter.name);
  private port: ErrorReporterPort = NOOP;

  get enabled(): boolean {
    return this.port.enabled;
  }

  /** Installed once at bootstrap by whichever adapter the environment names. */
  use(port: ErrorReporterPort): void {
    this.port = port;
    this.logger.log(`Error reporting ${port.enabled ? "enabled" : "disabled"}.`);
  }

  captureException(error: unknown, context: ReportContext): void {
    try {
      this.port.captureException(error, { ...requestReportContext(), ...context, extra: redact(context.extra) });
    } catch (failure) {
      // A reporter that throws must never become the error it was reporting.
      this.logger.warn(`Reporter failed: ${failure instanceof Error ? failure.message : String(failure)}`);
    }
  }

  captureMessage(message: string, context: ReportContext, level: "fatal" | "error" | "warning" = "error"): void {
    try {
      this.port.captureMessage(message, { ...requestReportContext(), ...context, extra: redact(context.extra) }, level);
    } catch (failure) {
      this.logger.warn(`Reporter failed: ${failure instanceof Error ? failure.message : String(failure)}`);
    }
  }

  flush(timeoutMs: number): Promise<void> {
    return this.port.flush(timeoutMs).catch(() => undefined);
  }
}

const NOOP: ErrorReporterPort = {
  enabled: false,
  captureException: () => undefined,
  captureMessage: () => undefined,
  flush: () => Promise.resolve(),
};

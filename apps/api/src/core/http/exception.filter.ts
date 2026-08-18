import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  Optional,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";

import { ENVIRONMENT, type Environment } from "../config/environment";
import { currentRequestContext } from "../context/request-context";
import { AppError, InvariantError, type FieldError } from "../errors/app-error";
import { translateFailure } from "../errors/translate";
import { MetricsService } from "../metrics/metrics.service";
import { ErrorReporter } from "../observability/error-reporter";
import { logEvent } from "../observability/log-event";

/**
 * The one place a failure becomes a response.
 *
 * Every error — thrown deliberately, escaped from a driver, or a bug — leaves
 * through here, so one rule decides what a response may say and one shape
 * carries it:
 *
 *   { statusCode, code, message, reference, requestId, errors?, details? }
 *
 * `code` is a stable identifier the web app can switch on; `message` is a
 * sentence written for a person; `errors` carries field-level validation;
 * `reference` is the request id — the same value as the X-Request-Id header,
 * the same value on the audit and login-history rows this request wrote, and
 * the same value on the log line. A person quoting a reference from the
 * screen has named exactly one request.
 *
 * The rule about detail: an AppError or HttpException was written to be
 * read, and keeps its message everywhere. Anything else is translated if it
 * is a recognised failure (a dropped database connection becomes a 503 that
 * says so), and otherwise is a 500 that says nothing about the inside — in
 * production. In development the raw text and stack ride along under their
 * own keys, because the person reading it is the person who wrote the bug.
 */
export interface ErrorEnvelope {
  statusCode: number;
  code: string;
  message: string | string[];
  reference: string;
  requestId: string;
  errors?: readonly FieldError[];
  details?: Record<string, unknown>;
  // Development only.
  exception?: string;
  detail?: string;
  stack?: string;
}

/** Codes for the plain Nest exceptions the codebase already throws by status. */
const CODE_BY_STATUS: Record<number, string> = {
  400: "bad_request",
  401: "unauthenticated",
  402: "payment_required",
  403: "forbidden",
  404: "not_found",
  405: "method_not_allowed",
  406: "not_acceptable",
  408: "request_timeout",
  409: "conflict",
  410: "gone",
  413: "payload_too_large",
  415: "unsupported_media_type",
  422: "unprocessable",
  429: "rate_limited",
  500: "internal_error",
  501: "not_implemented",
  502: "bad_gateway",
  503: "service_unavailable",
  504: "gateway_timeout",
};

const GENERIC_SERVER_MESSAGE = "Something went wrong on our side. The error has been recorded.";
const GENERIC_CLIENT_MESSAGE = "That request could not be completed.";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Http");
  private readonly development: boolean;

  constructor(
    // Both optional so the filter still works constructed bare in a unit
    // test; in the application both are always present.
    @Optional() private readonly metrics?: MetricsService,
    @Optional() @Inject(ENVIRONMENT) environment?: Environment,
    @Optional() private readonly reporter?: ErrorReporter,
  ) {
    this.development = (environment?.NODE_ENV ?? process.env.NODE_ENV) !== "production";
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();

    const normalised = this.normalise(exception);
    const context = currentRequestContext();
    // The middleware that seals the context also mints the id; a failure
    // before that point (a malformed body, an origin refusal) has none, so
    // one is minted here and sent back the same way, so every error response
    // is quotable.
    const requestId = context?.requestId ?? readHeader(response, "x-request-id") ?? randomUUID();
    if (!response.headersSent) response.setHeader("x-request-id", requestId);

    const body: ErrorEnvelope = {
      statusCode: normalised.status,
      code: normalised.code,
      message: normalised.message,
      reference: requestId,
      requestId,
      ...(normalised.errors?.length ? { errors: normalised.errors } : {}),
      ...(normalised.details ? { details: normalised.details } : {}),
    };

    if (this.development && !normalised.deliberate) {
      body.exception = exception instanceof Error ? exception.name : typeof exception;
      body.detail = rawMessage(exception);
      body.stack = exception instanceof Error ? exception.stack : undefined;
    }

    this.record(request, normalised, exception, requestId, context?.startedAt);

    if (normalised.status === 429) {
      const retry = normalised.details?.["retryAfterSeconds"];
      if (typeof retry === "number") response.setHeader("retry-after", String(retry));
    }

    if (response.headersSent) return; // Streaming had begun; nothing more can be said.
    response.status(normalised.status).json(body);
  }

  // ── Normalisation ─────────────────────────────────────────────────────

  private normalise(exception: unknown): Normalised {
    const translated = translateFailure(exception);

    if (translated) {
      return {
        status: translated.getStatus(),
        code: translated.code,
        message: httpMessage(translated),
        errors: translated.errors,
        details: translated.details,
        // A translated failure has a sentence written for it, so it is shown
        // in every environment; but it was not thrown by application code,
        // and the developer still wants the raw text underneath.
        deliberate: exception instanceof AppError && !(exception instanceof InvariantError),
        internal: exception instanceof InvariantError ? exception.internalMessage : undefined,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        status,
        code: CODE_BY_STATUS[status] ?? `http_${status}`,
        message: httpMessage(exception),
        deliberate: true,
      };
    }

    // Nobody threw this on purpose and nobody recognised it.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: "internal_error",
      message: this.development
        ? rawMessage(exception)
        : GENERIC_SERVER_MESSAGE,
      deliberate: false,
    };
  }

  // ── Recording ─────────────────────────────────────────────────────────

  private record(
    request: Request,
    normalised: Normalised,
    exception: unknown,
    requestId: string,
    startedAt: Date | undefined,
  ): void {
    const route = routePattern(request);
    const fields = {
      requestId,
      method: request.method,
      route,
      path: request.originalUrl?.split("?")[0],
      status: normalised.status,
      code: normalised.code,
      durationMs: startedAt ? Date.now() - startedAt.getTime() : undefined,
      exception: exception instanceof Error ? exception.name : typeof exception,
      // The internal message of an invariant, or the raw text of an unknown
      // failure — for the log, never the response.
      internal: normalised.internal ?? (normalised.deliberate ? undefined : rawMessage(exception)),
    };

    this.metrics?.observeError({
      requestId,
      clientId: currentRequestContext()?.clientId ?? null,
      method: request.method,
      route,
      status: normalised.status,
      code: normalised.code,
    });

    if (normalised.status >= 500) {
      logEvent(this.logger, "error", "http.error", fields, exception instanceof Error ? exception.stack : undefined);
      // Reported as well as logged: this is the class of failure somebody
      // should be told about. A dependency outage is reported too — once
      // per occurrence, grouped by its code — because "the database went
      // away at 03:12" is exactly the alert an operator wants.
      this.reporter?.captureException(exception, {
        event: "http.error",
        requestId,
        route,
        code: normalised.code,
        status: normalised.status,
        extra: { method: request.method, path: fields.path, internal: fields.internal },
      });
    } else if (normalised.status === 401 || normalised.status === 403 || normalised.status === 429) {
      // Refusals are worth a line: a burst of them is a signal.
      logEvent(this.logger, "warn", "http.refused", fields);
    } else {
      logEvent(this.logger, "debug", "http.client_error", fields);
    }
  }
}

interface Normalised {
  status: number;
  code: string;
  message: string | string[];
  errors?: readonly FieldError[];
  details?: Record<string, unknown>;
  /** Thrown by application code with a message written to be shown. */
  deliberate: boolean;
  internal?: string;
}

function httpMessage(exception: HttpException): string | string[] {
  const payload = exception.getResponse();
  if (typeof payload === "string") return payload;
  const message = (payload as { message?: string | string[] }).message;
  return message ?? exception.message;
}

/**
 * The underlying message with Prisma's invocation banner removed.
 *
 * Prisma prefixes every error with "Invalid `prisma.$queryRaw()` invocation:"
 * and two blank lines, which names the call site rather than the cause. The
 * cause is the line after it, and that is what a developer needs to read.
 */
function rawMessage(exception: unknown): string {
  if (!(exception instanceof Error)) return String(exception);
  const stripped = exception.message.replace(/^\s*Invalid `[^`]+` invocation:\s*/u, "").trim();
  if (stripped.length > 0) return stripped;
  // Nothing but the banner: the driver put what it knew in `code` instead
  // (ECONNREFUSED, P1001), which is the useful part.
  const code = (exception as { code?: unknown }).code;
  return typeof code === "string" && code ? `${exception.name} ${code}` : exception.name;
}

function routePattern(request: Request): string {
  const route = (request as { route?: { path?: unknown } }).route;
  const path = route?.path;
  return typeof path === "string" && path.length > 0 ? `${request.baseUrl ?? ""}${path}` : "unmatched";
}

function readHeader(response: Response, name: string): string | undefined {
  const value = response.getHeader(name);
  return typeof value === "string" ? value : undefined;
}

export { GENERIC_CLIENT_MESSAGE, GENERIC_SERVER_MESSAGE };

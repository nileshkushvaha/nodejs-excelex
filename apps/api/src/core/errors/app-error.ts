import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * The application's error vocabulary.
 *
 * One base class, a stable machine-readable `code`, and a message written to
 * be shown to a person. That is the whole contract: anything thrown as an
 * AppError is safe to send to a browser in production, because it was written
 * for one. Anything else — a driver error, a programming mistake — is not, and
 * the filter translates or hides it.
 *
 * It extends Nest's HttpException rather than replacing it, deliberately. The
 * codebase already throws two hundred BadRequest/NotFound exceptions and every
 * one of them keeps working, is caught by the same filter, and lands in the
 * same envelope with a code derived from its status. New code prefers these
 * classes because a code such as `already_exists` survives a rewording, where
 * a message does not, and because field-level errors need somewhere to live.
 * A second, parallel hierarchy would be the mistake this file exists to avoid.
 */
export interface FieldError {
  /** Dotted path into the offending input, e.g. "address.pinCode". */
  readonly path: string;
  readonly message: string;
  /** The validator's own code (Zod: "too_small"), for clients that switch on it. */
  readonly code?: string;
}

export interface AppErrorOptions {
  /** Structured, user-safe context: ids, limits, counts. Never internals. */
  readonly details?: Record<string, unknown>;
  readonly errors?: readonly FieldError[];
  readonly cause?: unknown;
  /**
   * What the envelope's `message` carries when it is not the single sentence:
   * validation sends one message per issue, as it always has, so a client
   * that reads `message[0]` sees the specific sentence, not a summary.
   */
  readonly messages?: readonly string[];
}

export class AppError extends HttpException {
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly errors?: readonly FieldError[];

  constructor(status: HttpStatus, code: string, message: string, options: AppErrorOptions = {}) {
    // The payload shape Nest hands to filters and tests: a plain object with
    // the message on it, exactly as BadRequestException does.
    super(
      {
        statusCode: status,
        code,
        message: options.messages ?? message,
        errors: options.errors,
        details: options.details,
      },
      status,
      { cause: options.cause },
    );
    this.name = new.target.name;
    this.code = code;
    this.details = options.details;
    this.errors = options.errors;
  }
}

/** The input was understood and refused: one or more fields are wrong. */
export class ValidationError extends AppError {
  constructor(errors: readonly FieldError[], message = "Some of the details you entered could not be accepted.") {
    // 400 rather than 422, because that is what every existing caller and
    // every existing test expects from a refused body, and the distinction
    // buys nothing here: the client reads `errors`, not the status.
    super(HttpStatus.BAD_REQUEST, "validation_failed", message, {
      errors,
      messages: errors.map((error) => error.message),
    });
  }
}

export class NotFoundError extends AppError {
  constructor(what = "That record", options?: AppErrorOptions) {
    super(HttpStatus.NOT_FOUND, "not_found", `${what} could not be found.`, options);
  }
}

/** The request is fine; the state of the world refuses it. */
export class ConflictError extends AppError {
  constructor(message: string, code = "conflict", options?: AppErrorOptions) {
    super(HttpStatus.CONFLICT, code, message, options);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to do that.", code = "forbidden", options?: AppErrorOptions) {
    super(HttpStatus.FORBIDDEN, code, message, options);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "You need to sign in to do that.", code = "unauthenticated", options?: AppErrorOptions) {
    super(HttpStatus.UNAUTHORIZED, code, message, options);
  }
}

export class RateLimitedError extends AppError {
  constructor(retryAfterSeconds: number, message = "Too many attempts. Wait a moment and try again.") {
    super(HttpStatus.TOO_MANY_REQUESTS, "rate_limited", message, { details: { retryAfterSeconds } });
  }
}

/** Something this request depends on — the database, Redis, a partner — is not answering. */
export class DependencyUnavailableError extends AppError {
  constructor(dependency: string, message: string, options?: AppErrorOptions) {
    super(HttpStatus.SERVICE_UNAVAILABLE, `${dependency}_unavailable`, message, options);
  }
}

/**
 * A programming error caught on purpose: the code reached a state it was
 * written never to reach. Reported as a 500 with a code, so it can be counted
 * and found, and with a message that says nothing about the inside.
 */
export class InvariantError extends AppError {
  constructor(code: string, internalMessage: string, cause?: unknown) {
    super(
      HttpStatus.INTERNAL_SERVER_ERROR,
      code,
      "Something went wrong on our side. The error has been recorded.",
      { cause },
    );
    this.internalMessage = internalMessage;
  }

  /** For the log line, never for the response. */
  readonly internalMessage: string;
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

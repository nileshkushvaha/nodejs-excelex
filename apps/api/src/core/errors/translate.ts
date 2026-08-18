import { HttpException, HttpStatus } from "@nestjs/common";

import {
  AppError,
  ConflictError,
  DependencyUnavailableError,
  InvariantError,
  NotFoundError,
  ValidationError,
} from "./app-error";
import { isZodError, toFieldErrors } from "./validation";

/**
 * From whatever was thrown to an AppError, if it is one we recognise.
 *
 * The raw error from a driver is written for the driver's author: "Invalid
 * `prisma.$queryRaw()` invocation: Server has closed the connection" names
 * the call that noticed the problem, not the problem. The person reading a
 * response — a developer at a terminal, or an operator on the performance
 * screen — needs to know *what is wrong and what to check*: the database is
 * down, a row already exists, a record is referenced elsewhere.
 *
 * Only recognised shapes are translated. Everything else stays a 500 with the
 * generic sentence in production and the raw text in development, because a
 * confident wrong explanation is worse than an honest "unknown". Every
 * translation here is an AppError, so the filter has one kind of thing to
 * render and one place to look for the code.
 */
export function translateFailure(exception: unknown): AppError | null {
  if (exception instanceof AppError) return exception;
  if (exception instanceof HttpException) return translateWrappedSyntaxError(exception);
  if (!(exception instanceof Error)) return null;

  return (
    translateZod(exception) ??
    translateBodyParser(exception) ??
    translateDatabasePackage(exception) ??
    translatePrisma(exception) ??
    translateRedis(exception) ??
    translateContext(exception) ??
    null
  );
}

// ── Validation that escaped the boundary ─────────────────────────────────────

/** A schema `.parse()`d in a service rather than at the controller: same answer. */
function translateZod(error: Error): AppError | null {
  return isZodError(error) ? new ValidationError(toFieldErrors(error)) : null;
}

// ── Express body parsing ─────────────────────────────────────────────────────

const JSON_SYNTAX_TEXT = /Unexpected (token|end of JSON|non-whitespace|string|number)|in JSON at position|is not valid JSON|Expected ('|,|:|double-quoted)/u;

/**
 * Nest turns body-parser's SyntaxError into a plain BadRequestException before
 * any filter sees it (routes-resolver: mapExternalException), so the `type`
 * tag is gone by the time it arrives. The message is still the JSON parser's,
 * and that is enough to say what actually happened.
 */
function translateWrappedSyntaxError(exception: HttpException): AppError | null {
  if (exception.getStatus() !== 400) return null;
  const payload = exception.getResponse();
  const message = typeof payload === "string" ? payload : (payload as { message?: unknown }).message;
  if (typeof message === "string" && JSON_SYNTAX_TEXT.test(message)) {
    return new AppError(HttpStatus.BAD_REQUEST, "malformed_body", "The request body is not valid JSON.", {
      cause: exception,
    });
  }
  return null;
}

/** body-parser tags its errors with a `type`; without this they were 500s. */
function translateBodyParser(error: Error & { type?: string; status?: number }): AppError | null {
  switch (error.type) {
    case "entity.parse.failed":
      return new AppError(HttpStatus.BAD_REQUEST, "malformed_body", "The request body is not valid JSON.");
    case "entity.too.large":
      return new AppError(
        HttpStatus.PAYLOAD_TOO_LARGE,
        "payload_too_large",
        "The request body is larger than this endpoint accepts.",
      );
    case "encoding.unsupported":
    case "charset.unsupported":
      return new AppError(
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        "unsupported_encoding",
        "The request body uses an encoding this endpoint does not accept.",
      );
    case "request.aborted":
      return new AppError(HttpStatus.BAD_REQUEST, "request_aborted", "The request ended before its body arrived.");
    default:
      return null;
  }
}

// ── @excelex/database's own errors ───────────────────────────────────────────

/**
 * The isolation layer's refusals. Each is a programming error — a query
 * outside a client context, a nested write the extension cannot scope — and
 * each is kept a 500, because the caller did nothing wrong. They get a code
 * so they can be counted and searched for, and their message stays internal.
 */
function translateDatabasePackage(error: Error & { code?: string }): AppError | null {
  switch (error.code) {
    case "MISSING_CLIENT_CONTEXT":
      return new InvariantError("client_context_missing", error.message, error);
    case "CLIENT_CONTEXT_MISMATCH":
      return new InvariantError("client_context_mismatch", error.message, error);
    case "NESTED_WRITE_FORBIDDEN":
      return new InvariantError("nested_write_forbidden", error.message, error);
    default:
      return null;
  }
}

// ── Prisma / PostgreSQL ──────────────────────────────────────────────────────

const CONNECTION_CODES = new Set([
  "P1000", // authentication failed
  "P1001", // cannot reach server
  "P1002", // timed out
  "P1003", // database does not exist
  "P1008", // operation timed out
  "P1010", // access denied
  "P1011", // TLS
  "P1017", // server closed the connection
]);

const CONNECTION_TEXT =
  /closed the connection|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|connection terminated|Connection refused|timeout expired|the database system is (starting|shutting)|too many clients|remaining connection slots/iu;

const databaseDown = (cause: unknown) =>
  new DependencyUnavailableError(
    "database",
    "The database is not reachable right now, so this request could not be completed. " +
      "Try again in a moment; if it persists, check that PostgreSQL is running and accepting connections.",
    { cause },
  );

const redisDown = (cause: unknown) =>
  new DependencyUnavailableError(
    "redis",
    "Redis — which holds the job queue and cache — is not reachable right now. " +
      "Try again in a moment; if it persists, check that Redis is running.",
    { cause },
  );

/**
 * Prisma's error classes, matched by name rather than `instanceof`.
 *
 * The generated client and `@prisma/client` each carry their own copies of
 * these classes, and which copy threw depends on which module loaded the
 * engine first. A name and a `code` survive that; an `instanceof` does not,
 * and silently misses — which is exactly the failure this file exists to stop.
 */
interface PrismaLike extends Error {
  code?: string;
  meta?: unknown;
}

const PRISMA_NAMES = new Set([
  "PrismaClientKnownRequestError",
  "PrismaClientUnknownRequestError",
  "PrismaClientInitializationError",
  "PrismaClientRustPanicError",
]);

function translatePrisma(error: PrismaLike): AppError | null {
  if (error.name === "PrismaClientInitializationError") return databaseDown(error);

  if (error.name === "PrismaClientKnownRequestError") {
    if (error.code && CONNECTION_CODES.has(error.code)) return databaseDown(error);
    // The pg driver adapter forwards the socket's own code (ECONNREFUSED,
    // ECONNRESET, "Server has closed the connection") in `code`, or nothing
    // at all, with an empty message. Either way the database went away.
    if (!error.code || CONNECTION_TEXT.test(error.code) || CONNECTION_TEXT.test(error.message)) {
      return databaseDown(error);
    }
    return translateKnown(error);
  }

  if (PRISMA_NAMES.has(error.name) && CONNECTION_TEXT.test(error.message)) return databaseDown(error);

  // A pg driver error that escaped Prisma's wrapping.
  if (CONNECTION_TEXT.test(error.message) && /pg|postgres|database/iu.test(error.stack ?? "")) {
    return databaseDown(error);
  }

  return null;
}

/** The constraint failures worth a sentence: what happened, not which index. */
function translateKnown(error: PrismaLike): AppError | null {
  switch (error.code) {
    case "P2002": {
      const fields = (error.meta as { target?: string[] } | undefined)?.target;
      const which = fields?.length ? ` (${fields.join(", ")})` : "";
      return new ConflictError(`A record with the same value already exists${which}.`, "already_exists", {
        details: fields?.length ? { fields } : undefined,
        cause: error,
      });
    }
    case "P2003":
      return new ConflictError(
        "That change would leave other records pointing at something that no longer exists.",
        "referenced_elsewhere",
        { cause: error },
      );
    case "P2025":
      return new NotFoundError("The record you are trying to change", { cause: error });
    case "P2024":
      return new DependencyUnavailableError(
        "database_pool",
        "The database is busy and did not free a connection in time. Try again in a moment.",
        { cause: error },
      );
    case "P2034":
      return new ConflictError(
        "Another change landed on the same record at the same time. Refresh and try again.",
        "write_conflict",
        { cause: error },
      );
    default:
      return null;
  }
}

// ── Redis ────────────────────────────────────────────────────────────────────

function translateRedis(error: Error): AppError | null {
  if (
    error.name === "MaxRetriesPerRequestError" ||
    (/Redis|:6379\b/u.test(error.message) && CONNECTION_TEXT.test(error.message)) ||
    /Stream isn't writeable|enableOfflineQueue/u.test(error.message)
  ) {
    return redisDown(error);
  }
  return null;
}

// ── Request context invariants ───────────────────────────────────────────────

/** `requireRequestContext()` outside a request: a wiring mistake, not a user error. */
function translateContext(error: Error): AppError | null {
  if (/request context is sealed|actor is already attached/u.test(error.message)) {
    return new InvariantError("request_context_missing", error.message, error);
  }
  return null;
}

# ADR-0005 — Error handling, logging and correlation

**Status:** Accepted (implemented 19 August 2026)
**Context:** Phase 1 — Engineering and SaaS foundation
**Related:** ADR-0002 (isolation), ADR-0003 (sessions), ADR-0004 (background work), DEC-003 (Zod at the boundary)

---

## Context

An audit of the API and web app on 19 August 2026 found error handling that worked but had grown by accretion:

- The error body's `reference` was a fresh UUID unrelated to the `X-Request-Id` header, the `requestId` stored on audit and login-history rows, or any log line. A reference a person quoted could not be found.
- Validation was twenty copies of the same three lines, none of which kept the field path; forms could only show one banner.
- Logs were unstructured text with no request or client id, there were no process-level handlers for unhandled rejections, and `enableShutdownHooks()` was never called, so `onModuleDestroy` (Prisma, Redis, workers) did not run on SIGTERM.
- The CSRF origin check was Express middleware outside the Nest pipeline, so its refusal came back as an HTML page.
- Driver errors escaped verbatim in development ("Invalid `prisma.$queryRaw()` invocation") and as a generic 500 in production, with nothing between: a stopped database and a null dereference looked the same.
- The web app could not tell "forbidden" from "the API is down": one helper returned `null` for both, so during an outage twenty-six pages said "you do not hold this permission" and the application layout redirected to the sign-in page.

The application will grow in features, integrations and traffic; each of these gaps compounds with size. The decision is a single foundation that every current and future module uses, not a set of patches.

## Decision

**1. One error vocabulary, extending what exists.** `AppError` (in `apps/api/src/core/errors/`) extends Nest's `HttpException` and carries a stable machine-readable `code`, a message written for a person, optional field-level `errors`, and optional user-safe `details`. Typed subclasses cover the recurring cases (`ValidationError`, `NotFoundError`, `ConflictError`, `ForbiddenError`, `UnauthorizedError`, `RateLimitedError`, `DependencyUnavailableError`, `InvariantError`). Because it extends `HttpException`, the two hundred existing `throw new BadRequestException(...)` calls keep working and land in the same envelope with a code derived from the status; new code prefers the typed classes because a code survives a rewording and a message does not. There is deliberately no second, parallel hierarchy.

**2. Validation happens once, at the boundary, and keeps the path.** `parseOrThrow(schema, input)` replaces every inline `safeParse` and throws a `ValidationError` whose `errors` carry `path`, `message` and the validator's own `code`. The envelope's `message` remains the array of issue sentences it always was, so a client reading `message[0]` sees what it saw before; a form that wants field-level placement reads `errors`.

**3. One envelope, RFC 9457-aligned, backward compatible.**

```
{ statusCode, code, message, reference, requestId, errors?, details? }
```

`reference` **is** the request id — the same value as the `X-Request-Id` response header, the same value on the audit and login-history rows the request wrote, and the same value on the log line. A person quoting a reference has named exactly one request. `content-type` stays `application/json` rather than `application/problem+json` so existing clients need no change; the field names map one-to-one onto Problem Details (`status`, `title`/`detail`, `instance`) if that is ever wanted.

**4. One filter, one rule about detail.** Every failure — thrown deliberately, escaped from a driver, or a bug — leaves through `AllExceptionsFilter`, registered through `APP_FILTER` so it can be given the metrics service and the environment. An `AppError`/`HttpException` was written to be read and keeps its message everywhere. Anything else is passed through `translateFailure`, which recognises Prisma connection loss and constraint codes (by error *name* and `code`, not `instanceof`, because the generated client and `@prisma/client` carry separate class copies), the pg adapter's socket codes, Redis, body-parser and Nest's wrapping of JSON syntax errors, Zod errors thrown outside a controller, the database package's isolation refusals, and request-context invariants. Anything unrecognised is a 500 that says nothing about the inside in production; in development the raw text and stack ride along under `detail`/`stack`.

**5. Structured logging with correlation.** `logEvent(logger, level, event, fields, stack?)` writes one object per line — event name, `requestId`, `clientId`, `actorId`, and the caller's fields — through Nest 11's `ConsoleLogger`, which prints JSON in production and readable text in development. Secret-shaped keys are redacted before they are written. `LOG_LEVEL` is the single knob. `installProcessHandlers()` logs unhandled rejections and uncaught exceptions as `fatal` events and then closes the application and exits non-zero, so the supervisor restarts a clean process; `enableShutdownHooks()` is on, so a SIGTERM lets a worker finish its job.

**6. Errors are counted by code and the recent ones are visible.** `excelex_http_errors_total{code,status}` joins the Prometheus registry (route is deliberately not a label — it is on the request counter, and code × route × status is the cardinality trap). The last two hundred server-side failures — time, route, status, code, reference; never the message or the stack — are kept in memory and shown on the Application Performance screen.

**7. The web app reads the contract, and tells the three failures apart.** `ApiError` (client-safe, `apps/web/src/lib/api-error.ts`) parses the envelope; `readApiError(response)` is used by every browser-side fetch (sign-in, import, logout). Server-side, `getResult<T>()` returns a typed result; `get<T>()` keeps returning `null` for "you may not see this" (401/403/404 and other refusals — the amber "you do not hold" panel is still right) but **throws** `ApiUnavailableError` for 5xx and network failure, which stops the page at the nearest error boundary. Because Next replaces a server component's error with a generic message in production and preserves only a pre-set `digest`, the error carries `status;code;reference` in its digest and the boundary decodes it — so a person sees "503 · The system is unavailable · Reference …" and can retry. `getCurrentSession()` returns `null` only for 401; an outage no longer redirects to sign-in. `ActionResult` gains `code`, `reference`, `fieldErrors`, `messages`, `errors`; `FormError` lists every sentence and prints the reference for server-side failures; `Field` accepts an `error` to place a sentence under its input.

## Alternatives considered

- **`application/problem+json` and Problem Details field names outright.** The right target shape, but renaming `statusCode`/`message` breaks every client at once for no functional gain today. The envelope maps one-to-one; switching is a rename, not a redesign.
- **A separate error class hierarchy independent of Nest.** Cleaner on paper; in practice it means two ways to fail and a migration of two hundred call sites before the codebase is consistent. Extending `HttpException` gets the same envelope from day one.
- **`instanceof` on Prisma error classes.** Missed silently in the running application because two class copies exist; matching on `name` and `code` was verified against a stopped database.
- **A third-party logger (pino, winston) now.** Nest 11's `ConsoleLogger` already emits JSON and levels; adding a dependency buys transports the deployment does not yet need. `logEvent` is the seam — swapping the logger later touches one file.
- **Rendering an outage as `null` with smarter copy in every page.** Twenty-six edits that would drift, and it still could not redirect-vs-explain correctly in the layout. Throwing to the boundary is one change and covers pages that do not exist yet.
- **A hosted error tracker (Sentry) as the primary mechanism.** Wanted, and the structured `http.error` event with `requestId` is exactly what one ingests — but the operator screen and the correlation must not depend on a third party being configured.

## Consequences

- **A behaviour change on the web:** an API outage now renders a 503 error screen with a reference instead of the permission panel or a redirect to sign-in. This is the intended behaviour, and it is a visible change.
- `BadRequestException("X not found.")` in eight master controllers was corrected to `NotFoundException`; clients that special-cased 400 for a missing record (none are known) would see 404.
- The `message` field is `string | string[]`; it stays that way for validation. New consumers should read `errors` and `code`, and treat `message` as display text.
- Field-level errors are available to every form but only placed beside inputs where a form passes `fieldErrors` to `Field`; existing forms show the improved banner and adopt placement incrementally.
- Rate limiting is still not implemented; `RateLimitedError` (429, `Retry-After`) exists so that when it is, the contract is already there. The audit's finding stands and is tracked separately.
- The recent-errors ring is per process and lost on restart, like the rest of the in-memory performance window; Prometheus and the log are the durable records.
- Integration tests now sign in as a test-owned administrator (`qa-admin@excelex.in`, reset on every boot) rather than the seeded human account, after a hard-coded seed password locked that account out mid-session.

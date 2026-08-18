# Errors, references and logs

The contract is in [ADR-0005](../adr/ADR-0005-error-handling-and-observability.md). This is how to use it.

## Somebody quotes a reference

A reference looks like `9aa49961-f760-4659-85c6-89d5a88d3c4f`. It appears on error screens ("Reference …"), in form banners for server-side failures, and in every failed API response as `reference` and `requestId`, and in the `X-Request-Id` response header. **It is the request id.** One reference names exactly one request.

1. **Log line.** Search the API log for the reference. The failure is an `http.error` (5xx) or `http.refused` (401/403/429) event with `requestId`, `clientId`, `actorId`, `method`, `route`, `status`, `code`, and — for a 5xx — the exception class and stack. In production the log is one JSON object per line; `jq 'select(.requestId=="…")'` finds it.
2. **What the request did before it failed.** The Activity Log (`/system/activity`) and Login History (`/system/login-history`) screens store the same id on their rows (`requestId`); filter or search by it to see any audit event the request wrote.
3. **Whether it is a pattern.** Application Performance (`/system/performance`) lists the most recent server-side failures with their code and reference, and `excelex_http_errors_total{code,status}` in Prometheus counts them.

## Reading an error code

Every failed response carries a `code`. The stable ones:

| Code | Status | Meaning | What to check |
| --- | --- | --- | --- |
| `validation_failed` | 400 | The input was refused; `errors[]` names each field. | The form. Not an operational problem. |
| `malformed_body` | 400 | The body was not valid JSON. | The client. |
| `unauthenticated` | 401 | No session, or it expired. | Sign in again. |
| `forbidden` / `origin_rejected` | 403 | Missing permission / a cross-origin write. | Roles; or the page's origin. |
| `not_found` | 404 | No such record — or no such client host. | The URL and, for a whole host, `client_hostnames`. |
| `already_exists`, `referenced_elsewhere`, `write_conflict`, `conflict` | 409 | A database constraint or a concurrent edit. | Reload and retry; if it repeats, the data. |
| `rate_limited` | 429 | Too many attempts; `Retry-After` is set. | Wait. |
| `database_unavailable` | 503 | PostgreSQL is not reachable or dropped the connection. | Is Postgres up? Connections exhausted? See below. |
| `database_pool_unavailable` | 503 | Prisma's pool timed out. | Slow queries (`/system/performance` → DB per model), pool size. |
| `redis_unavailable` | 503 | Redis (queue and cache) is not reachable. | Is Redis up? |
| `internal_error` | 500 | Nobody threw this on purpose and nobody recognised it. | The log line and its stack; then decide whether the filter should learn to translate it. |
| `client_context_missing`, `nested_write_forbidden`, `request_context_missing`, `cache_*`, `job_without_client` | 500 | A programming invariant was violated. | The stack; this is a bug to fix, not to retry. |

Anything under `system.*` screens uses these same codes.

## Development versus production

In development the response also carries `exception` (class name), `detail` (the raw driver message with Prisma's banner stripped) and `stack`. In production it never does; the log has them.

## Log levels and shape

`LOG_LEVEL` (`fatal`, `error`, `warn`, `log`, `debug`, `verbose`) — `log` in production, `debug` in development by default. Production writes JSON; development writes coloured text. Secret-shaped keys (`password`, `token`, `authorization`, `cookie`, …) are redacted before they are written.

Event names to search for: `http.error`, `http.refused`, `http.client_error` (debug), `job.failed`, `scheduler.tick_failed`, `scheduler.dispatch_failed`, `process.unhandled_rejection`, `process.uncaught_exception`, `process.warning`.

## When the database is down

Symptoms: `database_unavailable` on every request; the web app shows "503 · The system is unavailable" with a reference; `/api/v1/readyz` returns 503.

1. `docker compose -f infrastructure/docker/docker-compose.yml ps` (development) or your platform's equivalent — is Postgres running and healthy?
2. If the daemon itself is gone (Colima/Docker Desktop stopped), start it, then `pnpm infra:up`.
3. The API reconnects on its own; nothing needs restarting. Refresh the page or press "Try again".

## Adding a new error

- A refusal the user can act on: throw a typed `AppError` subclass (or `new AppError(status, "your_code", "A sentence.")`). Give it a code that will still be true after the sentence is reworded.
- A failure from a dependency you have just integrated: add a case to `translateFailure` (`apps/api/src/core/errors/translate.ts`) with a test, so it becomes a code and a sentence rather than a generic 500.
- Never build the message from the exception's own text in a response; that is what `detail` in development is for.

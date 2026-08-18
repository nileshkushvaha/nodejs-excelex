# ADR-0004 — Background work and the System screens

**Status:** Accepted (implemented 19 August 2026)
**Context:** Phase 1 — Engineering and SaaS foundation
**Related:** ADR-0002 (isolation), ADR-0003 (sessions)

---

## Context

Rate imports and bulk copies had grown past what a request should carry, and every operational question — "did last night's job run", "why is sign-in slow", "who changed this rate", "is this account under a password spray" — was being answered by reading logs or the database by hand. The product needs a place to run work outside a request and a set of screens from which the account is operated rather than used: a queue monitor, a scheduler, a cache manager, an activity log, a login history and an application-performance view.

The constraint that shapes all of it is ADR-0002: a client's rows are reachable only through a transaction that has sealed that client's context, at both the query layer and the database. Anything that runs outside a request — a worker, a timer, a scrape — has no host to resolve a client from, and so has to be given one explicitly or must not touch client data at all.

## Decision

**1. Redis holds the queue; Postgres holds the record.** BullMQ on Redis does claiming, retry and back-off — solved problems, and not ones worth re-solving on a relational table. Every job also has a row in the client-scoped `jobs` table, written *before* the Redis entry, so a job that Redis loses is a visible "queued, never started" rather than an invisible nothing. The queue monitor reads both: Redis for what is running now, Postgres for what happened last Tuesday. Redis is not client-scoped; pause, resume and clean therefore act on every account on the deployment and are labelled as such.

**2. A worker seals the client context from the job's envelope.** Every job carries `clientId`; the worker opens `forClient(clientId, …)` and runs the handler inside it. A handler therefore sees exactly one client's rows under exactly the row-level security a request would, and there is no code path in which a job runs "as nobody" or bypasses RLS. Job names are a closed list; a schedule that could name arbitrary work would be a way to run arbitrary work.

**3. Cross-client reads are done by the `excelex_jobs` role, on an enumerated list of tables.** The schedule dispatcher must find every client's due schedules from one process. Rather than a role that bypasses RLS, `excelex_jobs` gets `SELECT, UPDATE` and a `jobs_global_read` policy on `job_schedules` (alongside the existing grant on `sessions`), visible in `pg_policies` and reviewable in a diff. It claims a schedule with an optimistic update on `next_run_at`, so two dispatchers cannot fire the same run, and holds a short Redis lease so normally only one tries. Everything the dispatched job then does runs under the client's own context (point 2).

**4. Login history is its own table, append-only, and records the failures.** The audit trail says a session was created; it does not say who tried and failed, from where. `login_attempts` records every attempt — success, wrong password, unknown address, locked, and the attempt that tripped the lock — with IP and user agent. Recording never changes what the sign-in path says to the caller: the anti-enumeration properties of ADR-0003 hold, and the difference between "unknown address" and "wrong password" is visible only to an administrator reading the history. Update is revoked for every runtime role; delete is left to the retention sweep.

**5. Caching is namespaced, client-scoped and inspectable.** Cache keys are `excelex:<env>:cache:<clientId|platform>:<namespace>:<key>` with a closed list of namespaces, each with a documented TTL. Client-scoped by construction, so one client's flush cannot touch another's, and separate from the queue's key prefix so no cache operation can reach a job. Hit and miss counts are kept per namespace so the manager can show whether a cache earns its keep.

**6. Performance is measured in-process and exported in the standard shape.** An HTTP middleware, a Prisma timing extension and the worker feed both a Prometheus registry (`/api/metrics`, token-guarded in production) and a rolling in-memory window the UI reads without a metrics server. Route labels are patterns, never raw paths, and cardinality is capped. The screen is honest that its figures are for one instance; Prometheus is what aggregates.

**7. Permissions.** A new `System` group: `system.queue`, `system.schedule`, `system.cache` (view/manage each), `system.login.view`, `system.performance.view`. The activity log reads the audit trail and keeps `settings.audit.view`. View and manage are split throughout because reading a queue is harmless and draining one is not.

## Alternatives considered

- **Postgres-only queue (SKIP LOCKED).** Workable, and one fewer dependency. Rejected because retry, back-off, delayed and repeatable jobs and per-queue concurrency would all be re-implemented, and Redis was already wanted for the cache and the session hot path.
- **`BYPASSRLS` for the dispatcher.** The obvious way to scan schedules across clients. Rejected because it removes the database barrier for every job in the process, silently; the enumerated grant costs one policy per table and stays reviewable.
- **Recording failed logins in `audit_events`.** Already partly true (`auth.signin.failed`). Rejected as the primary store because the audit trail cannot be aged out, an attempted spray would fill it, and its shape (actor, action, entity) fits "somebody did something" badly when the point is that nobody did.
- **A hosted APM instead of in-process metrics.** Not rejected — `/api/metrics` exists precisely so one can be pointed at it — but the operator screen must not depend on a third party being configured.

## Consequences

- Two more moving parts in every environment: Redis must be up for the API to enqueue, and the `DATABASE_JOBS_URL` role must exist for the scheduler. Both are checked at readiness and shown on the performance screen.
- Queue pause/resume/clean are deployment-wide actions exposed to a client administrator with `system.queue.manage`. Acceptable for a single-tenant-per-deployment start; a multi-tenant deployment should grant that permission to platform staff only, and the screen says so.
- The in-memory performance window is lost on restart and is per instance; a deployment with several API processes sees several partial pictures in the UI and one whole one in Prometheus.
- Login history and the jobs table grow with use. The retention sweep is a job like any other and has to be scheduled per client; a client without the schedule keeps rows until someone adds it.

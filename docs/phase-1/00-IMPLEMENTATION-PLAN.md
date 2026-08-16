# ExcelEx Courier SaaS — Phase 1 Implementation Plan

## Engineering and SaaS Foundation (audit-first)

**Document status:** Proposed — not approved
**Prepared:** 16 August 2026
**Revision:** 2 — incorporates the findings of the independent audit recorded in §16
**Baseline:** `ExcelEx-NodeJS-SaaS-Project-Foundation.md` (treated as the source of truth)
**Scope:** Foundation only. No courier business module is designed or implemented here.

---

## 0. How to read this plan

This plan is written audit-first. That means three things:

1. **Nothing is built before it is specified.** Every workstream states what is built, what proves it, and what it explicitly excludes.
2. **Every deviation from the baseline is raised, not absorbed.** Deviations appear in `03-DECISIONS-REQUIRING-APPROVAL.md` with options and a recommendation. Six block code generation.
3. **Every claim is falsifiable.** "Client isolation works" is not an outcome; "a test asserts client B receives zero rows when querying client A's data through both the service layer and raw SQL under the application role" is.

Phase 1 ends when the **eleven** acceptance criteria in §11 are green in CI on a clean checkout. Phase 2 does not begin before that.

### Explicitly out of scope for Phase 1

Not designed, not scaffolded, not stubbed: AWB inventory, shipment booking, manifests, scanning workflows, DRS, POD, tracking events, rate cards, invoices, receipts, statements, carrier adapters, the customer portal's business screens, Xpresion export ingestion, and every item in foundation §4. The USB scanner workflow is Phase 3. Migration is Phase 2.

What Phase 1 *does* build for those domains is the ground they stand on: the client boundary, the permission vocabulary, the audit spine, the idempotency mechanism, the money and time conventions, and the test harness that makes cross-client leakage a build failure.

---

## 1. Confirmed decisions carried into this plan

| # | Decision | Value | Record |
| --- | --- | --- | --- |
| C1 | Code location | The monorepo is scaffolded into `~/Sites/nodejs/excelex-log` on the ExcelEx development machine. Installs and dev servers are run locally by the project owner. | This plan, §2.1 |
| C2 | Development hostnames | `*.lvh.me` wildcard, behind the same Nginx configuration as production. | ADR-0001 |
| C3 | Client isolation depth | Prisma client extension **and** PostgreSQL row-level security. | ADR-0002 |
| C4 | Session model | Per-host HTTP-only cookies; a session is bound to one client host. | ADR-0003 |

---

## 2. Repository and workspace foundation

### 2.1 Target layout

The repository directory is `excelex-log` (an existing path); the workspace package is named `excelex-platform`, matching baseline §7.

```text
excelex-log/                          # repository root; package name: excelex-platform
├── apps/
│   ├── web/                          # Next.js 16 — public site, admin, client ops, customer portal
│   └── api/                          # NestJS 11 — HTTP entrypoint + worker entrypoint (DEC-006)
├── packages/
│   ├── database/                     # Prisma schema, migrations, RLS policies, client-scoped client
│   ├── contracts/                    # Shared request/response types + generated OpenAPI client
│   ├── validation/                   # Zod schemas shared between web and api
│   ├── permissions/                  # Permission vocabulary, role definitions, guard primitives
│   ├── configuration/                # Zod-validated typed environment configuration
│   ├── observability/                # Logger, request context, redaction, error reporting
│   ├── ui/                           # shadcn/ui-derived design system
│   ├── testing/                      # Test factories, client harness, cross-client assertions
│   ├── eslint-config/
│   └── tsconfig/
├── infrastructure/
│   ├── docker/                       # Compose: postgres, redis, minio, mailpit, nginx
│   ├── nginx/                        # Reverse proxy config — shared shape, dev and prod
│   └── deployment/                   # Dockerfiles, deploy workflow, migration job
├── docs/
│   ├── adr/
│   ├── phase-1/
│   └── runbooks/
├── tools/
├── .github/workflows/
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

One structural deviation from baseline §7: `apps/worker` is not a separate application. See DEC-006 — it is a second bootstrap entrypoint in `apps/api`, deployed as a separate container with its own scaling profile, so that jobs and HTTP handlers share one domain layer without inventing a package boundary to smuggle code across.

### 2.2 Workspace mechanics

- **pnpm workspaces**, `apps/*` and `packages/*`.
- **Turborepo** for task orchestration and caching. It earns its place because `packages/database` (Prisma generate), `packages/contracts` (OpenAPI client generation) and `packages/permissions` are genuine build inputs to both apps.
- Pipeline tasks, matching the root scripts in the setup guide exactly: `build`, `dev`, `format:check`, `lint`, `typecheck`, `test:unit`, `test:integration`, `test:security`, `test:e2e`, `db:generate`, `check:rls-coverage`.
- `db:generate` is a declared dependency of `build`, `typecheck` and every test task, so a stale Prisma client cannot produce a passing build.
- Internal packages are consumed as `workspace:*` and export TypeScript source through the `exports` field with a `publishConfig` override — fast dev loop, no stale-build class bugs.

### 2.3 Engineering standards fixed on day one

| Standard | Rule |
| --- | --- |
| TypeScript | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax`. Every option set explicitly in `tsconfig.base.json` rather than inherited from TS 6 defaults. |
| `any` | Forbidden by lint outside `*.test.ts` and declared-module shims. |
| Money | `numeric(18,4)` in PostgreSQL, `Prisma.Decimal` in code. A lint rule forbids arithmetic on identifiers matching `/amount\|price\|charge\|rate\|total\|balance/i` unless the operand is a `Decimal`. Floating-point money is a build failure. |
| Time | `timestamptz` only. UTC in storage and transport; Asia/Kolkata is a presentation concern of `apps/web`. |
| Identifiers | UUIDv7 primary keys (DEC-008). Human-facing sequential numbers come later from a client-scoped sequence service, never from a PK. |
| Deletion | No hard deletes on operational or financial entities. `deleted_at timestamptz` plus partial unique indexes, established now so later phases inherit it. |
| Commits | Conventional Commits, enforced by commitlint in CI. |
| Branching | Trunk-based, short-lived branches, `main` protected. **All eleven checks in §11 are required for merge**, not nine. |

---

## 3. Local development environment

### 3.1 Docker Compose services

`infrastructure/docker/docker-compose.yml` provides infrastructure only; the applications run on the host for fast reload.

| Service | Image | Port | Purpose |
| --- | --- | --- | --- |
| `postgres` | `postgres:18.6-alpine` | 5432 | Primary database |
| `redis` | `redis:8-alpine` | 6379 | Cache, BullMQ, session cache |
| `minio` | S3-compatible | 9000/9001 | Object storage for the storage abstraction |
| `mailpit` | mail catcher | 8025 | Captures activation and notification email |
| `nginx` | `nginx:alpine` | 443 | Reverse proxy with mkcert TLS |

Nginx is in the development stack deliberately. The client resolution chain (§5.1) begins with a trusted proxy setting `X-Forwarded-Host`, and the session cookie uses the `__Host-` prefix, which requires HTTPS. Without Nginx locally, the trusted-proxy branch, the hop-count configuration, the header-spoofing rejection and the production cookie semantics are exactly the code that never runs in development — which would defeat the reason `lvh.me` was chosen in the first place.

Postgres is initialised with **four roles**, because RLS depends on the runtime role being neither owner nor superuser:

| Role | Purpose | Under RLS |
| --- | --- | --- |
| `excelex_owner` | Owns the schema; used only by Prisma Migrate | Bypasses unless `FORCE` is applied — which is why the app must not use it |
| `excelex_app` | Client runtime | Yes. **No grants at all on platform tables** (§4.2) |
| `excelex_platform` | Platform administration runtime | Yes on client tables; granted on platform tables |
| `excelex_readonly` | Reporting and inspection | Yes |

### 3.2 Hostnames (ADR-0001)

| Environment | Public site | Platform admin | Client | API |
| --- | --- | --- | --- | --- |
| Local | `https://lvh.me` | `https://admin.lvh.me` | `https://<slug>.lvh.me` | same-origin `/api/v1` via Nginx |
| Production | `www.excelex.in` | `admin.excelex.in` | `<slug>.excelex.in` | same-origin `/api/v1` via Nginx; `api.excelex.in` reserved for machine-to-machine |

`*.lvh.me` resolves to `127.0.0.1` from public DNS. Offline development is the trade-off; §3.2 of the setup guide gives the `/etc/hosts` fallback.

### 3.3 Reserved subdomains

`www`, `admin`, `api`, `app`, `static`, `assets`, `cdn`, `mail`, `smtp`, `ftp`, `status`, `docs`, `support`, `help`, `blog`, `dev`, `staging`, `test`, `internal`, `excelex`. Enforced by a database check constraint *and* service-layer validation — a reserved slug is a hostname-hijacking vector, not a naming preference.

---

## 4. Data foundation

### 4.1 Phase 1 schema

Only platform and identity concerns. No courier entity appears.

**Platform-scoped (no `client_id`; not reachable by `excelex_app`):**

- `clients` — id, slug, legal name, status (`trial`, `active`, `suspended`, `expired`, `closed`), timestamps
- `client_hostnames` — many hostnames to one client, `is_primary`, `verified_at`. A table rather than slug-parsing, so client custom domains (foundation §16) are not foreclosed.
- `plans`, `plan_limits` (limit key, value, enforcement mode), `subscriptions`
- `platform_users` — ExcelEx staff
- `platform_sessions` — platform administrator sessions
- `platform_user_mfa` — TOTP secret, recovery codes, `enrolled_at`, `last_used_at`
- `platform_roles`, `platform_role_permissions`, `platform_user_roles`
- `platform_audit_events` — append-only
- `support_access_sessions` — who accessed which client, why, when, and what expired it

Platform authentication needs its own session, MFA and permission tables because the client-scoped equivalents carry a mandatory `client_id` and sit behind RLS. A platform administrator has no client, so those tables physically cannot hold their state.

**Client-scoped (mandatory `client_id`, RLS-protected):**

- `branches` — the branch scope authorisation depends on
- `users` — client staff; unique on `(client_id, email)`
- `user_branch_memberships`
- `roles`, `permissions`, `role_permissions`, `user_roles`
- `sessions` — opaque server-side client sessions
- `user_mfa` — available, not enforced in Phase 1
- `invitations` — single-use, hashed activation tokens
- `audit_events` — append-only client audit trail
- `usage_counters` — metered usage per period
- `storage_ledger` — byte-level accounting per foundation §8.5
- `idempotency_keys` — request key, client, endpoint, request hash, response snapshot, expiry (§8.4)
- `outbox_events` — transactional outbox

### 4.2 Invariants pinned in the database, not only in code

| Invariant | Mechanism |
| --- | --- |
| Every client row carries a client | `client_id uuid NOT NULL` + FK to `clients` |
| Uniqueness never spans clients | Every unique constraint on a client table leads with `client_id` |
| A foreign key never crosses clients | Composite FKs referencing `(client_id, id)`. Two conditions are easy to get wrong: the referenced columns need a UNIQUE **constraint**, not merely a unique index; and nullable relations need `MATCH FULL`, because the default `MATCH SIMPLE` skips verification entirely when any referencing column is NULL — an optional `branch_id` would otherwise go unchecked. |
| Client runtime cannot read platform data | `REVOKE ALL` on every platform table from `excelex_app`. The narrow reads a client request legitimately needs — client status, hostname resolution, plan limits — go through `SECURITY DEFINER` functions returning only those columns. |
| Reserved slugs cannot be registered | Check constraint on `clients.slug` |
| Audit rows are immutable | `REVOKE UPDATE, DELETE` from every runtime role on audit tables, asserted by a CI privilege check |
| Money is exact | `numeric(18,4)`; no `double precision` column anywhere |

The revoke rule matters more than it looks. `excelex_app` is the role every client request runs as, and RLS by construction protects only tables that have a `client_id`. Without an explicit revoke, a blanket `ALTER DEFAULT PRIVILEGES` grant would let any client request read the full customer list, every subscription, and the platform administrators' password hashes — with no policy in the way.

### 4.3 Row-level security

```sql
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches FORCE  ROW LEVEL SECURITY;

CREATE POLICY client_isolation ON branches
  USING      (client_id = nullif(current_setting('app.client_id', true), '')::uuid)
  WITH CHECK (client_id = nullif(current_setting('app.client_id', true), '')::uuid);
```

- `FORCE` removes the table owner's default exemption. It does not constrain superusers or `BYPASSRLS` roles, which is why the runtime role must be neither.
- `nullif` matters: unset returns `NULL` and denies the row, which fails closed correctly, but an empty string would make `''::uuid` raise a type error at query time rather than deny.
- `WITH CHECK` is written explicitly. For a `FOR ALL` policy PostgreSQL already reuses `USING` to validate new rows, so writes are not unprotected by default; stating it separately keeps the new-row rule from silently inheriting a visibility rule that later changes.

Policies are generated from the Prisma schema by `tools/generate-rls.ts` and emitted into migrations. The coverage check (§11, criterion 10) asserts both halves: every model carrying `client_id` has a policy, and every platform table is either policy-protected or explicitly revoked.

### 4.4 Migrations

Prisma Migrate connects as `excelex_owner` via `DATABASE_MIGRATION_URL`; the runtime connects as `excelex_app` or `excelex_platform` via `DATABASE_URL`. Two URLs, distinct roles — the application never holds migration privileges. Migrations are forward-only in production; rollback is a new migration, reviewed like any other change. Every migration is reviewed for lock behaviour before reaching an environment with data.

---

## 5. Client context — the canonical boundary

The project's standing engineering instructions forbid scattering manual `clientId` filters through controllers and require one canonical boundary. Phase 1 builds exactly that; everything else is downstream of it.

### 5.1 Resolution chain

```text
Request
  → Nginx sets X-Forwarded-Host / X-Forwarded-Proto (trusted proxy only)
  → Nest ClientResolutionMiddleware
       ├─ derive host from the trusted header, never from a body/query/user header
       ├─ reject any host not matching the configured base-domain suffix  → 404
       ├─ classify: platform host | client host | public host
       ├─ look up client_hostnames (Redis-cached, explicit invalidation)
       ├─ reject non-active client status                                → 403 / 402
       └─ seal a RequestContext into AsyncLocalStorage
  → Guards (origin check → authentication → client membership → permission → branch scope)
  → Controller → Service → ClientPrismaService
```

`RequestContext` is `{ requestId, clientId?, clientSlug?, hostKind, actor?, branchScope, ip, userAgent, startedAt }` and is **immutable once sealed**. A `clientId` arriving in a request body, query string or client-set header is not merely ignored — it is a validation error that writes a security audit event, because in a correct client it never happens.

### 5.2 Enforcement layers

| Layer | Mechanism | Failure mode it catches |
| --- | --- | --- |
| Transport | Host allowlist + trusted-proxy config | Host header spoofing |
| Application | `ClientContextGuard` — every route is client-scoped unless explicitly `@PlatformRoute()` or `@PublicRoute()` | A developer forgetting to scope a new endpoint |
| ORM | Prisma extension injecting `clientId` into every `where` and `data`; throws `MissingClientContextError` when context is absent | A service that builds a query by hand |
| Database (client tables) | RLS policies under a non-owner role | Raw SQL, reporting queries, future services, ORM bugs |
| Database (platform tables) | `REVOKE ALL` from `excelex_app`; `SECURITY DEFINER` functions for the narrow legitimate reads | A client request reaching platform data that RLS does not cover |
| Cache | `ClientCacheService`, mandatory `t:<clientId>:` prefix; raw Redis client not injectable into domain services | Cache key collision across clients |
| Queue | `ClientJobData` base type; the worker re-seals context from the payload before the handler runs | A job running with no client, or the wrong one |
| Storage | `clients/<clientId>/…` prefix derived only from context | Path traversal or client-controlled object keys |

The deliberate escape hatch is `prisma.$asPlatform(reason, fn)`: callable only from `apps/api/src/platform/**` (ESLint import-boundary rule), requires a stated reason, and writes a `platform_audit_events` row on every invocation.

### 5.3 The cost, stated plainly

RLS reads client identity from a session variable, and `SET LOCAL` is only meaningful inside a transaction. Every client-scoped request therefore runs its database work in a Prisma interactive transaction: an extra round trip, a connection held for the request's database duration, and Prisma's default five-second transaction timeout now applying to every request — so it is configured explicitly rather than inherited. PgBouncer in transaction-pooling mode is compatible.

A session-level `SET` (without `LOCAL`) would persist on a pooled connection and leak client context to whichever request borrows it next. An integration test asserts no such statement exists anywhere in the codebase; it is the single highest-value test in the RLS design.

The cost is accepted because the alternative — application code as the sole barrier between two courier companies' financial data — is not acceptable for a platform sold to third parties. Recorded as DEC-007.

---

## 6. Authentication and authorisation

### 6.1 Sessions (ADR-0003)

- **Opaque server-side session identifiers**, not JWTs. Revocation is immediate and total — which matters when a client deactivates staff, when ExcelEx suspends a client, or during incident response.
- Cookie scoped to the exact host, named `__Host-excelex_session`. That prefix is enforced by the browser: it refuses the cookie unless it is `Secure`, `Path=/`, and carries no `Domain` attribute. Per-host scoping therefore does not depend on our own correctness.
- **`SameSite` provides no protection between clients.** All client hosts share the registrable domain `excelex.in`, so they are same-site; only host-only cookie scope separates them. CSRF is mitigated explicitly (§6.5), not assumed away.
- `HttpOnly`, `SameSite=Lax`, `Secure`. Rotation on privilege change, idle and absolute expiry, device and IP recorded, concurrent-session listing available for the later licensing model.
- Platform administrators authenticate on `admin.excelex.in` against `platform_users` / `platform_sessions` with **mandatory** TOTP MFA.

### 6.2 Credentials

Argon2id via `@node-rs/argon2` (OWASP baseline: 19 MiB, 2 iterations, parallelism 1), tuned against the target host before launch. Activation-by-invitation only in Phase 1 — no self-service signup, because plan assignment is a platform-owner action. Invitation tokens are 32 random bytes, stored hashed, single-use, 72-hour TTL. Generic failure messages that do not reveal whether an account exists. Legacy Xpresion password hashes are never imported (foundation §10.7).

### 6.3 Permission model

A permission is `<domain>.<resource>.<action>` — `operations.shipment.create`, `billing.invoice.finalise`, `platform.client.suspend`. The vocabulary lives in `packages/permissions` as a typed constant, so a typo in a guard is a compile error rather than a silent authorisation gap. Platform and client permissions are separate vocabularies backed by separate tables (§4.1).

Authorisation composes four questions, in order: is the actor authenticated on this host; do they belong to *this* client (membership, not merely a valid session); do they hold the permission; is the target inside their branch scope.

Phase 1 ships the mechanism and the platform/client seeds. Courier permissions arrive with the modules that need them.

### 6.4 Plans, quotas and metering

`plan_limits` supports `hard` (block), `soft` (warn) and `metered` (record). A `QuotaService` exposes `assertWithin(limitKey, delta)`. Phase 1 proves **all three modes** against real limits — `branches.max` as `hard`, `users.active` as `soft`, `api.requests` as `metered` — rather than shipping two untested enum values. Storage accounting is a byte ledger with configurable warning thresholds (80%, 90%); at the hard limit it blocks non-essential uploads while preserving login, tracking, downloads and administrative cleanup, exactly as foundation §8.5 requires.

### 6.5 HTTP security baseline

Foundation §13 requires these, and each is cheap now and awkward to retrofit:

- **Origin verification.** Every non-safe method is checked against an `Origin` / `Sec-Fetch-Site` allowlist; a request whose origin is not the exact host it addresses is rejected and audited. This is the correct CSRF mitigation given that all client hosts share a site.
- **Security headers** via `helmet`: CSP with per-response nonces, HSTS with preload, `X-Content-Type-Options`, `Referrer-Policy`, and `frame-ancestors 'none'` by default. On a platform where one compromised client page is same-site with every other, CSP and framing policy are foundation concerns.
- **Global rate limiting** per IP, per session and per client, in addition to the stricter login limiter, with the client tier driven by the plan's API limit.
- **Body-size and upload limits**, with content type validated by magic bytes rather than file extension.

---

## 7. Application shells

### 7.1 `apps/web` — Next.js 16

App Router with route groups matching host classification:

```text
src/app/
├── (public)/          www — marketing, public tracking shell, login routing
├── (platform)/        admin — client lifecycle, plans, quotas, support access
├── (client)/          <slug> — operations shell, navigation, branch switcher
└── (portal)/          <slug>/portal — client customer portal shell
```

Middleware resolves the host, classifies it, and rewrites to the correct route group. It carries the host forward but never a client identifier the browser could influence.

Server Components fetch authenticated data through a server-side API client that forwards the session cookie. No business rule executes in the browser — a rule this plan adopts and enforces with an ESLint boundary forbidding imports from `packages/database` anywhere under `apps/web`.

Design system: Tailwind CSS 4 with a CSS-first theme, shadcn/ui components generated into `packages/ui`. Accessibility is a launch requirement — keyboard-first operation is what the Phase 3 scanner workflows will depend on.

### 7.2 `apps/api` — NestJS 11

```text
src/
├── main.http.ts              # HTTP entrypoint
├── main.worker.ts            # BullMQ worker entrypoint (DEC-006)
├── core/                     # context, client isolation, auth, audit, config, health, logging, idempotency
├── platform/                 # platform administration (the only $asPlatform caller)
├── clients/                  # clients, branches, users, roles, invitations
├── billing-platform/         # plans, subscriptions, quotas, metering
└── shared/                   # storage, cache, queue, outbox, mail ports
```

Rules that keep the modular monolith modular: a module exposes a service interface and others import the module, never a sibling's internal file (ESLint import boundaries); cross-module effects go through the outbox and domain events, not direct writes into another module's tables; REST is versioned by URI (`/api/v1/...`); OpenAPI is generated at build time and committed, so a breaking contract change appears in a diff. Validation is Zod through a Standard-Schema-compatible pipe, sharing schemas with `apps/web` (DEC-003).

### 7.3 Configuration and secrets

`packages/configuration` defines one Zod schema for the entire environment surface, validated at boot. The process refuses to start on a missing or malformed variable.

- `.env.example` is committed and complete; `.env*` is gitignored.
- Local development uses `.env`. **Staging and production read secrets from the platform secret store** (AWS Secrets Manager or the chosen host's equivalent), injected at container start — never from a file in the image, never from the repository.
- Encryption of integration credentials (carrier, SMS, email, payment) is **deferred to the phase that introduces the first credential**, per foundation §13's requirement for the capability rather than its Phase 1 delivery. Phase 1 delivers the column type and this recorded decision, not an envelope-encryption abstraction with zero call sites.
- Production boot assertions refuse to start on: an unprefixed session cookie, `DATABASE_URL` resolving to a superuser or table owner, `SESSION_SECRET` under 32 bytes, or `APP_BASE_DOMAIN` not matching the serving certificate.

---

## 8. Background jobs, storage, observability, idempotency

### 8.1 Queues

BullMQ on Redis. All payloads extend `ClientJobData { clientId, requestId, actorId? }`; a `ClientWorkerHost` re-seals `RequestContext` before the handler runs, so a job faces the same boundary as an HTTP request. Queue names are prefixed per environment, not per client — client separation lives in the payload and the context, avoiding queue-count explosion at scale. Jobs are idempotent by construction with a `jobId` derived from the business key.

**Job monitoring** is a named deliverable, not an aspiration: Bull Board mounted at `/platform/jobs` on the admin host, behind platform authentication and the `platform.jobs.view` permission, showing queue depth, active, completed, failed and delayed jobs, with retry and drain actions gated on `platform.jobs.manage`. Failures land in a dead-letter queue with a retention policy. Acceptance: an E2E test that fails a seeded job, finds it in the dead-letter view, retries it, and confirms it succeeds.

### 8.2 Transactional outbox

Domain events are written in the same transaction as the state change; a poller enqueues them. This prevents "the record was created but the notification never fired" — a bug class that is expensive to diagnose later and nearly free to prevent now. Phase 1 has real events to carry: client created, client suspended, user invited, quota threshold crossed.

### 8.3 Object storage

A `StorageService` port with an S3 adapter; MinIO locally. Keys are `clients/<clientId>/<domain>/<yyyy>/<mm>/<uuid>-<sanitised-name>`, derived from context. Uploads validated by content type and magic bytes. Every write updates `storage_ledger`. Downloads are pre-signed, short-lived, and authorised before the URL is issued.

### 8.4 Idempotency

Foundation §13 requires idempotency for bookings, scans, imports, carrier calls and webhooks — all of which arrive in Phases 3–5. The middleware is built now because it is the one cross-cutting mechanism that is far cheaper to establish than to retrofit into every write endpoint later.

An `Idempotency-Key` header on any non-safe request is looked up in `idempotency_keys`, scoped by client and endpoint. A repeat with a matching request hash returns the stored response; a repeat with a *different* hash is a 422, because that indicates a client bug rather than a retry. Keys expire on a configurable window. Phase 1 exercises it on client creation and invitation acceptance.

### 8.5 Observability

Pino structured JSON logging; every line carries `requestId`, `clientId`, `actorId`. A redaction path list covers passwords, tokens, cookies, authorization headers and integration credentials. `/healthz` is dependency-free liveness; `/readyz` checks database, Redis, storage and queue. OpenTelemetry instrumentation is wired with exports disabled by default. Sentry sits behind an interface so the vendor choice is not baked into domain code.

---

## 9. Test strategy

The layered strategy from foundation §14, made concrete.

| Layer | Tool | What it covers | Gate |
| --- | --- | --- | --- |
| Unit | Vitest | Context sealing, host parsing, permission evaluation, quota arithmetic, config schema, origin checks | Required |
| Integration | Vitest + real Postgres/Redis | Repositories, transactions, RLS behaviour, privilege revokes, outbox, idempotency, session lifecycle | Required |
| API | Supertest against a booted Nest app | Authentication, authorisation, client isolation, error contracts, OpenAPI conformance | Required |
| **Cross-client security** | Vitest, table-driven over the Prisma DMMF | Every client model, through service layer and raw SQL under `excelex_app`; every platform table under the same role | **Required, cannot be skipped** |
| E2E | Playwright | The acceptance criteria as user journeys | Required |

The cross-client suite is the one test that must not be possible to forget. It enumerates models from the Prisma DMMF **at runtime** rather than from a hand-written list, so a client model added in Phase 2 is automatically covered — and if it lacks a policy or a scope, the suite fails on the day the model is added rather than on the day a customer notices.

Integration tests run against a real PostgreSQL 18 and Redis 8, never a mock or in-memory substitute, because the behaviour under test *is* database behaviour.

**Test isolation must not use rollback transactions on the client path.** The application already runs every client-scoped operation inside a Prisma interactive transaction (§5.3), and Prisma does not nest `$transaction`; a test wrapping the system under test in an outer transaction would either fail or silently bypass the `SET LOCAL` it is meant to be validating — including the cross-client suite itself. Client-path tests therefore use truncation between tests, or a template database cloned per suite. Rollback isolation is reserved for pure repository tests that do not exercise the client boundary.

One specific test carries outsized weight and is called out so it is not lost in a suite: an assertion that **no session-level `SET` (without `LOCAL`) exists anywhere in the codebase**, since one would persist on a pooled connection and leak client context to the next request that borrows it.

Concurrency tests for AWB allocation and financial mutation arrive with those features; Phase 1 ships the `packages/testing` harness that makes writing them straightforward.

---

## 10. Deployment, backup and data lifecycle

Baseline §11 says "CI/**CD**", and §12–13 require backups, restore drills and retention policies. A foundation phase that stands up the system of record without proving a restore has not finished.

### 9.1 Containers and delivery

- Multi-stage Dockerfiles for `apps/api` (one image, two commands: HTTP and worker) and `apps/web`, running as a non-root user on a pinned base image digest.
- Images built in CI, tagged by commit SHA, pushed to the registry, and scanned (Trivy) with high and critical findings failing the build.
- A **staging environment** matching production topology, deployed automatically from `main`.
- **Migrations run as a separate deploy job under `excelex_owner`**, before the application rollout, never at application boot. Application containers hold no migration privileges — the privilege boundary the whole isolation design rests on.
- Nginx configuration is a reviewed artifact in `infrastructure/nginx/`, shared in shape between development and production, defining the trusted-proxy hops, the `/api/v1` proxy path, TLS termination and the security headers Nginx owns.
- Rollback is redeploying the previous image tag; forward-only migrations mean a rollback never un-migrates.

### 9.2 Backup, restore and disaster recovery

- Automated daily base backups plus continuous WAL archiving (PITR) for PostgreSQL; object-storage versioning and lifecycle rules for the bucket.
- **Documented RTO and RPO**, agreed with the business rather than assumed.
- A **restore drill executed during Phase 1**, not promised for later: restore to a scratch environment, run migrations, boot the app, and verify a known seeded record. Its duration becomes the measured RTO.
- Runbooks in `docs/runbooks/`: restore, credential rotation, client suspension, incident triage, job-queue recovery.

### 9.3 Retention, purge and client offboarding

- Soft deletes (`deleted_at`) need something that eventually purges them; a scheduled job applies the retention policy per entity class, with audit and financial records exempt for the statutory period.
- Foundation §8.5 sets a five-year retention limit as a plan dimension — the enforcement mechanism is defined here even though the courier data it will act on arrives later.
- **Client offboarding** is a foundation obligation for a platform sold to third parties: `status = closed` triggers a defined sequence of export availability, a grace period, then deletion of client data and storage objects, with the audit trail of the offboarding itself retained.

---

## 11. Acceptance criteria — the Phase 1 vertical slice

Foundation §18 defines nine criteria; two more are added because they are cheap now and expensive to retrofit. **All eleven are required checks for merge to `main`.**

| # | Criterion | Automated proof |
| --- | --- | --- |
| 1 | Monorepo builds and tests successfully | From a clean clone: `pnpm install --frozen-lockfile && pnpm turbo run format:check lint typecheck build test:unit test:integration` |
| 2 | Docker starts PostgreSQL and Redis locally | Compose health checks pass; `smoke:infra` connects to Postgres, Redis, MinIO and Nginx, and asserts the runtime role is neither owner nor superuser |
| 3 | Next.js resolves a known client subdomain | Playwright loads `https://acme.lvh.me` and asserts client-specific server-rendered content; an unknown host returns 404 |
| 4 | NestJS resolves the same client from trusted request context | API test asserts the resolved client matches the trusted host, that a body/query/header-supplied `clientId` is rejected with a security audit event, and that a spoofed `X-Forwarded-Host` from an untrusted hop is ignored |
| 5 | A platform administrator can create a client | E2E on `admin.lvh.me`: TOTP sign-in → create client → hostname registered → plan assigned → audit event written |
| 6 | A client administrator can activate an account and sign in | E2E: invitation captured in Mailpit → activation → password set → sign-in on the client host → cookie asserted host-only with the `__Host-` prefix |
| 7 | Cross-client access is rejected and tested | Service layer denied; raw SQL under `excelex_app` returns zero rows; client A's session rejected on client B's host; a client-B-targeted write refused; `excelex_app` denied on every platform table |
| 8 | Health checks and structured logging are operational | `/healthz` and `/readyz` asserted; log assertions confirm `requestId`/`clientId` present and that a seeded secret never appears in output |
| 9 | CI runs formatting, static analysis, tests and production builds | `.github/workflows/ci.yml` with these required checks: `format:check`, `lint`, `typecheck`, `test:unit`, `test:integration`, `test:security`, `test:e2e`, `build`, `docker:build`, `check:rls-coverage`, `gitleaks` |
| 10 | RLS and privilege coverage | Every model with `client_id` has a policy; every platform table is policy-protected or revoked from `excelex_app`; audit tables reject `UPDATE`/`DELETE` |
| 11 | No committed secrets | `gitleaks` over the diff on every pull request |

---

## 12. Sequenced delivery

Each step ends in a reviewable commit. No step begins before the previous one's proof passes.

| Step | Work | Proof |
| --- | --- | --- |
| S0 | Approve `03-DECISIONS-REQUIRING-APPROVAL.md`; run the version verification in `01-VERSION-MATRIX.md` §5 | Signed decisions; `versions.resolved.txt` committed |
| S1 | Repo, pnpm workspace, Turborepo, tsconfig, ESLint, Prettier, commitlint, `.nvmrc`, CI skeleton | `pnpm turbo run format:check lint typecheck` passes |
| S2 | Docker Compose incl. Nginx + mkcert, four Postgres roles, MinIO, Mailpit; `packages/configuration` | **Criterion 2**; a config-validation test fails on a missing variable |
| S3 | `apps/api` skeleton: bootstrap, pino, Terminus, OpenAPI, helmet, error contract | **Criterion 8**; API builds under the pinned TypeScript (DEC-002 resolved) |
| S4 | `apps/web` skeleton: route groups, Tailwind 4, `packages/ui` seed, host middleware | `next build` succeeds; host classification unit-tested |
| S5 | `packages/database`: schema for §4.1, migrations, RLS generator, privilege revokes, client-scoped client | **Criterion 10**; RLS proof test; composite-FK and nested-write proof; RLS latency benchmark (DEC-007) |
| S6 | Client context: middleware, ALS, guards, origin check, cache/queue/storage scoping, `$asPlatform` + audit | **Criterion 4** |
| S7 | Authentication: client and platform sessions, Argon2id, invitations, TOTP MFA, rate limiting | **Criterion 6** |
| S8 | Authorisation: permission vocabularies, role seeds, branch scope, membership guard | Permission unit and API tests green |
| S9 | Platform administration: client CRUD, hostname registration, plans, quotas (all three modes), support access | **Criterion 5** |
| S10 | Queues, job monitoring, outbox, storage service, ledger, idempotency middleware | Job client-context, dead-letter retry, outbox and idempotency tests green |
| S11 | Cross-client security suite; Playwright journeys; full CI wiring | **Criteria 1, 3, 7, 9, 11** |
| S12 | Deployment: Dockerfiles, image build and scan, staging environment, migration job, Nginx production config | Staging deploys from `main`; migration job runs as owner |
| S13 | Backup, PITR, restore drill, retention job, offboarding sequence, runbooks | Restore drill executed and its duration recorded as measured RTO |

An honest estimate for S1–S13 with a single experienced engineer is eight to eleven weeks, with S5–S7 carrying most of the risk. That assumes the decisions in §13 are resolved at S0 rather than mid-flight.

---

## 13. What must be approved before code is generated

Set out with options, trade-offs and recommendations in `03-DECISIONS-REQUIRING-APPROVAL.md`:

**Blocking at S0:** DEC-001 Node line · DEC-002 TypeScript line · DEC-003 validation library · DEC-005 API hostname and proxy mechanism · DEC-006 worker as an entrypoint rather than an app · DEC-007 accepting the RLS transaction cost

**Blocking at S2:** DEC-009 Redis or Valkey (it selects the compose image)

**Blocking at S5:** DEC-008 UUIDv7 identifiers (primary-key type is unchangeable afterwards) · DEC-010 hosting region and managed-Postgres RLS support

**Before phase end:** DEC-004 Prisma 7 vs 8 · DEC-011 client custom domains

## 14. Risk register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| A client model is added later without a policy or scope | Cross-client leakage | Coverage check + DMMF-driven security suite, both required for merge |
| A platform table is added without a revoke | Client request reads platform data | The same coverage check asserts the platform half |
| A session-level `SET` reaches production | Client context leaks across pooled connections | Dedicated integration test asserting no non-`LOCAL` `SET` exists |
| RLS transaction wrapping degrades performance | Latency on hot paths | Benchmark at S5; revisit pool sizing before revisiting design if median rises >15 ms |
| NestJS 12 lands mid-project with breaking changes | Rework | Zod validation now; ESM-friendly module syntax; upgrade is a scheduled spike |
| TypeScript 6 breaks Nest decorator metadata | Build failure at S3 | Proven at S3 before dependent work; documented fallback to TS 5.9 |
| Managed Postgres restricts role creation or `FORCE RLS` | Isolation design invalidated late | DEC-010 verified before S5 against a trial instance |
| Restore has never been executed | Recovery time unknown during a real incident | S13 drill produces a measured RTO, not an estimated one |
| Phase 2 pressure to start courier modules early | The foundation ships unverified | The eleven criteria are a gate, not a milestone |
| Xpresion export feasibility proves worse than assumed | Migration scope grows | Phase 2 begins with export inventory before schema work — unchanged from the baseline |

---

## 15. Position

The baseline is sound and this plan implements it rather than reinterpreting it. The substantive additions are the `client_hostnames` table (keeping custom domains open), composite client-aware foreign keys (making cross-client references structurally impossible), separate platform authentication tables with platform data revoked from the client runtime role, the DMMF-driven coverage checks (making isolation coverage automatic rather than remembered), and the idempotency mechanism (built once now rather than retrofitted into every write endpoint in Phases 3–5). The one structural deviation — the worker as a second entrypoint rather than a third application — is raised for approval rather than assumed.

Nothing here builds a courier feature. That is the point.

---

## 16. Audit history

**Revision 2, 16 August 2026.** An independent adversarial audit of revision 1 against the baseline returned four blocking findings and a number of corrections, all incorporated above:

| Finding | Resolution |
| --- | --- |
| Platform authentication had nowhere to store sessions, MFA secrets or permissions — criterion 5 could not have passed | `platform_sessions`, `platform_user_mfa`, `platform_roles`, `platform_role_permissions` added (§4.1) |
| `excelex_app` held blanket grants on platform tables, exposing the customer list and platform password hashes to any client request | `REVOKE ALL` on platform tables; `excelex_platform` role; `SECURITY DEFINER` accessors; coverage check extended (§4.2, §5.2) |
| CD, containers, staging and the deploy-time migration job were entirely absent | §10.1 added; S12 added |
| Backups, restore drills and DR were absent | §10.2 added; S13 added, with the drill executed in-phase |
| **Technical error:** `acme.excelex.in` and `api.excelex.in` are *same-site* (shared registrable domain), so `SameSite=Lax` does not separate them — the real mechanism is host-only cookie scope. The error had propagated into DEC-005's comparison | Corrected in §6.1, ADR-0003 and DEC-005; explicit origin verification added (§6.5) since `SameSite` protects nothing between clients |
| **Technical error:** a `FOR ALL` policy without `WITH CHECK` already reuses `USING` for new rows, so the stated justification was wrong | Corrected in §4.3 and ADR-0002; the practice is retained for the right reason |
| `current_setting(...)::uuid` fails loudly on an empty string rather than closed | `nullif(...)` added |
| Composite FK caveats unstated: nullable relations need `MATCH FULL`; referenced columns need a UNIQUE constraint, not an index; the Prisma cost is larger than the index cost | §4.2 corrected; proof added to S5 |
| Test isolation by transaction rollback conflicts with the interactive transactions RLS requires — Prisma does not nest `$transaction` | §9 test strategy corrected to truncation/template cloning for client-path tests |
| Nine vs eleven acceptance criteria inconsistent across documents; branch protection would have required nine | Standardised on eleven everywhere |
| No formatting check existed despite criterion 9 requiring one; turbo task names did not match the root scripts | `format:check` added and task names reconciled (§2.2) |
| Criterion 9's proof was self-referential | Replaced with a named workflow file and an enumerated required-checks list |
| Job monitoring was one vague clause | Named deliverable with an acceptance test (§8.1) |
| Security headers, CSRF/origin verification, global rate limiting and idempotency were missing | §6.5 and §8.4 added |
| Retention, purge and client offboarding were absent | §10.3 added |
| A KMS encryption abstraction was specified with zero call sites — the plan's own test for speculative work | Deferred to the phase with the first credential (§7.3) |
| Three enforcement modes shipped with one proven | All three now exercised (§6.4) |
| DEC-008/009/010 labelled "before phase end" though they gate S5, S2 and S5 | Re-classified (§13) |
| Baseline §11 has 15 bullets, not 16 | Noted; coverage confirmed against all 15 |
| Dangling cross-references and inconsistent version-pin expressions | Corrected across all documents |

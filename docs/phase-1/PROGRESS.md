# Phase 1 — Implementation Progress

**Updated:** 16 August 2026
**Milestone order:** A repository foundation · B local infrastructure · C database and client isolation ·
D host and request context · E authentication and authorization · F platform administration ·
G worker and storage · H Next.js foundation · I CI, documentation and closure

---

## Completed

### A — Repository foundation (partial)

- pnpm workspace (`apps/*`, `packages/*`) with `allowBuilds` entries recorded as deliberate
  supply-chain exceptions.
- `apps/api` NestJS 11 scaffold. Not yet wired to anything.
- `.gitignore` covering `node_modules`, build output and `.env`.

**Not done:** `packages/configuration` (the API validates its own environment with Zod for now),
ESLint/Prettier/commitlint at the root, `.nvmrc`, CI skeleton.

### B — Local infrastructure (partial)

- `infrastructure/docker/docker-compose.yml`: PostgreSQL 18 and Redis 8, both health-checked.
  The Postgres volume is mounted at `/var/lib/postgresql`, not `/data` — PostgreSQL 18 stores data
  in a major-version subdirectory and the old mount path makes the container refuse to start.

Adminer is included for database inspection, development only.

**Not done:** MinIO, Mailpit.

### C — Database and client isolation ✅ verified

The security foundation, complete and proven.

- **Schema** (`packages/database/prisma/schema.prisma`) — 18 models. Scope is **declared** per model
  (`@scope(platform)` / `@scope(client)`), never inferred from the presence of a `client_id` column
  (audit finding CT-1). All columns are snake_case via `@map`, so RLS policies, reporting views and
  raw SQL need no quoting.
- **Migration** `20260816182524_init`.
- **Roles** — `excelex_owner` (migrations only), `excelex_app` (client runtime), `excelex_platform`
  (control plane), `excelex_jobs` (background sweeps). None holds SUPERUSER, BYPASSRLS, CREATEROLE or
  CREATEDB, and the SQL asserts this rather than setting it.
- **Deny by default** — `REVOKE ALL` from `PUBLIC`; `ALTER DEFAULT PRIVILEGES ... REVOKE` so a new
  table is unreachable until classified and granted, failing loudly in development instead of
  silently exposing data in production.
- **RLS** — `ENABLE` + `FORCE` on all 8 client tables with a `client_isolation` policy reading
  `nullif(current_setting('app.client_id', true), '')::uuid`. `nullif` is what makes an unset context
  deny rather than raise 22P02.
- **Platform tables** — `REVOKE ALL` from `excelex_app` and `excelex_jobs`; the only legal reads are
  two `SECURITY DEFINER` accessors with pinned `search_path`, `STABLE`, and `EXECUTE` revoked from
  `PUBLIC` (audit finding CT-4).
- **Cross-client job reads** — one narrow, enumerable policy on `sessions` for `excelex_jobs`, in
  place of `BYPASSRLS` (audit finding CT-2).
- **Audit trail** — `UPDATE`, `DELETE`, `TRUNCATE` revoked from every runtime role.

**Verification — `pnpm --filter @excelex/database db:verify`, 29 passed, 0 failed:**

| Group | Asserted |
| --- | --- |
| Identity | runtime role is not superuser; no runtime role holds SUPERUSER/BYPASSRLS/CREATEROLE/CREATEDB |
| Coverage | all 8 client tables have ENABLE + FORCE RLS and carry the `client_isolation` policy |
| Platform barrier | `excelex_app` denied on all 10 platform tables; `excelex_jobs` denied on 4 |
| Row isolation | each client sees only its own rows; no context reveals nothing; empty-string context fails closed; context does not survive its transaction |
| Write barrier | cross-client INSERT rejected; a client cannot hand its own row to another |
| Audit | neither runtime role can UPDATE or DELETE `audit_events` |

---

### D — Host and request context ✅ working, not yet automatically tested

- `withClientContext()` is the only route to client data: it seals the client id into an
  `AsyncLocalStorage` store the Prisma extension reads, and opens the transaction whose first
  statement is a parameterised `set_config('app.client_id', $1, true)` (audit finding CT-3).
- The extension enumerates client-scoped models from the **DMMF at runtime**, so a model added later
  is covered on the day it is added.
- **NEW-1** handled: nested writes throw `NestedWriteError` rather than running with one barrier.
  Nested `connect` stays allowed — it cannot create a row, and the composite FKs already prevent a
  cross-client connect.
- **NEW-2** handled: `upsert` injects `clientId` into `where`, `create` *and* `update`.
- A supplied `clientId` that contradicts the sealed context raises rather than being overwritten.
- `ClientResolutionMiddleware` derives the client from the host only; unknown host → 404;
  caller-supplied `clientId` → 400; `X-Forwarded-Host` believed only when `TRUST_PROXY_HEADERS` is
  set (audit finding HH-1).

### E — Authentication ✅ working, not yet automatically tested

Opaque server-side sessions, SHA-256 token hashes, `__Host-` cookie, Argon2id credentials, global
fail-closed guard, permission checks, audit rows on sign-in and sign-out. Sign-in returns one
message for every failure and verifies a password even when no user matched.

### H — Next.js foundation ✅ working

Public site, tracking placeholder, sign-in, and the authenticated shell with the shared navigation.
Authorization is re-derived server-side in the layout on every render, never in `proxy.ts`. All
authenticated routes are dynamic — `next build` confirms only `/` and `/track` are static, which is
the real control replacing the rejected CA-4 corrections.

**Verified by hand, end to end:** `/healthz`, `/readyz`, 401 without a cookie, generic failure on a
bad password, sign-in issuing the `__Host-` cookie, `/auth/me`, a client-scoped dashboard summary,
sign-out returning 204 and the subsequent 401, unknown host 404, caller-supplied `clientId` 400, and
the same loop through the browser.

### E/F — Roles and permissions ✅ working, not yet automatically tested

A full RBAC model in `@excelex/permissions` plus `role_permissions`,
`user_permissions` and a synced `permissions` catalogue. Everything Spatie provides —
catalogue, role and user joins, direct user permissions, wildcards — plus four things it
does not:

| Improvement | Why |
| --- | --- |
| Catalogue is typed code; the table is its projection | A guard naming a permission that does not exist fails to compile, rather than failing silently at runtime |
| `DENY` effect, always winning | Expresses "this role, except this person" without inventing a near-duplicate role, which is how permission models rot |
| Expiring role assignments and grants | Temporary cover does not become permanent privilege |
| Cannot confer what you do not hold | Without it, `settings.role.manage` is a privilege-escalation primitive |

No implicit super-user: `*` is an ordinary grant row, visible and revocable. Wildcards
match on segment boundaries, so `operations.ship*` is rejected rather than silently
over-granting. Every mutation writes an audit event, with role changes recorded as a diff.

The **Roles** and **User access** screens are built against this API.

**Verified by hand:** a typo'd permission and a mid-segment wildcard refused; a valid
wildcard role created; a `DENY` without a reason refused; a `DENY` beating the `*` grant
(38 permissions → 37); a branch-scoped assignment with an expiry; and a user holding
`settings.role.manage` but no billing authority unable to grant it, unable to grant `*`,
and unable to strip the administrator role.

---

## Current milestone

**E/F completion, and tests for what already works.**

The critical gap: **milestones D, E and H have no automated tests.** Everything above was verified by
hand and by the shell proof. Until the suites exist, a regression in the extension or the guard is
invisible. That is the next work, ahead of new features:

- Unit: the extension's injection, mismatch rejection, nested-write rejection and `upsert` create
  branch; host classification; permission evaluation.
- Integration: the cross-client suite driven by the **DMMF**, replacing the hand-enumerated shell
  script; a nested write targeting another client asserted denied *with RLS dropped*, so the
  application barrier is proven independently (AUDIT-3 RLS-1/RLS-4).
- The assertion that no session-level `SET` exists anywhere in the codebase.
- Permission resolution: precedence, expiry, wildcard boundaries, branch scope — pure
  functions, so these are cheap unit tests and the most valuable ones in the codebase.

Then: invitations and activation, platform administration on the admin host, plans and quotas.

---

## Decisions recorded

| Date | Decision |
| --- | --- |
| 16 Aug 2026 | **The isolation unit is a *client*, not a *tenant*.** Renamed throughout the schema, SQL, scripts and working documents. `docs/GLOSSARY.md` is binding and states why *client* and *customer* must never be conflated. The baseline and the three audit reports keep the old word deliberately — they are received and dated records. |
| 16 Aug 2026 | **DEC-008 — primary keys are UUIDv7**, generated client-side by Prisma (`@default(uuid(7))`). Implemented in the schema; the decisions document still presents this as open and needs updating to match. |

---

## Accepted residual risk

| Risk | Why accepted |
| --- | --- |
| A PostgreSQL **superuser** sees every row. `FORCE ROW LEVEL SECURITY` removes the owner's exemption but does not constrain superusers or `BYPASSRLS` roles. | Inherent to PostgreSQL. Mitigated by the application never connecting as owner or superuser, and asserted on every proof run. |
| The audit trail is immutable **to the application**, not to the database owner. | Honest wording over false assurance. Hash-chaining and external append-only storage are deferred hardening (AUDIT-3 §4). |
| Development passwords are in `01-roles-and-rls.sql` and `.env`. | Local development only. `.env` is gitignored; staging and production read from the platform secret store, and production boot assertions reject an owner or superuser `DATABASE_URL`. |

## Deferred hardening

- Hash-chained and externally replicated audit log (AUDIT-3 §4).
- Redis ACL separation and TLS, as a boot assertion — required before Phase 1 acceptance.
- Client-aware memoization primitive (AUDIT-3: the one isolation gap with no barrier behind it) — due at Milestone D.
- Materialized-view prohibition in the RLS generator — cheap now, due at Milestone C closure.
- RLS latency benchmark and pool-saturation measurement (DEC-007).

## Known gaps against the plan

- **`tools/generate-rls.ts` does not exist.** Plan §4.3 specifies policies generated from the schema's
  scope annotations; `01-roles-and-rls.sql` currently lists the tables by hand. Until the generator and
  the coverage check exist, a model added in Phase 2 gets no policy and nothing fails. The proof asserts
  a count of 8, so a new client table would at least break the build — a backstop, not the control.
- **Eight tables from plan §4.1 are not in the schema:** `user_mfa`, `usage_counters`,
  `storage_ledger`, `idempotency_keys`, `outbox_events`, `platform_roles`, `platform_role_permissions`,
  `platform_user_roles`. Roles and permissions are currently string arrays on `roles.permissions` and
  `platform_users.permissions`. This is a deliberate narrowing for the first cut and must either be
  built at its milestone or reconciled into the plan.
- **The isolation proof is a shell script, not the DMMF-driven suite** required by plan §9. It is the
  seed of that suite, not a substitute — it enumerates tables by hand.

## How to run it

```bash
pnpm install
pnpm infra:up                 # postgres, redis, adminer
pnpm --filter @excelex/database exec prisma migrate deploy
pnpm --filter @excelex/database run db:secure
pnpm --filter @excelex/database run build && pnpm run db:seed
pnpm run db:verify            # 29 assertions, must be 0 failed
pnpm dev                      # api on :3001, web on :3000
```

| Surface | URL | Notes |
| --- | --- | --- |
| Web | http://localhost:3000 | sign in with the seeded administrator |
| API | http://localhost:3001/api/v1 | proxied at /api from the web origin |
| Adminer | http://localhost:8080 | server `postgres`, database `excelex` |
| Prisma Studio | `pnpm --filter @excelex/database exec prisma studio` | :5555 |

Seeded credentials are development-only and printed by the seed script.

## Blockers

None.

## Bugs found by using the product

Recorded because both were invisible to code review and neither had a test:

- **Soft-deleted rows squatted their unique values.** Deleting a role made its name
  permanently unusable. Fixed with the partial unique indexes the plan had already
  specified. Found by clicking "create role" in the UI.
- **A network failure took a whole page down with a 500.** An uncaught throw from
  `fetch` in a server component is not recoverable by the caller. Found when a restarted
  API produced a half-rendered form that looked like a layout bug.

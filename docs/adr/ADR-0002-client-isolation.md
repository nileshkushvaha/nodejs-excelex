# ADR-0002 — Client isolation: Prisma client extension plus PostgreSQL row-level security

**Status:** Accepted (confirmed by project owner, 16 August 2026)
**Context:** Phase 1 — Engineering and SaaS foundation
**Related:** ADR-0001 (hostname), ADR-0003 (sessions), DEC-007 (cost acceptance), DEC-010 (managed Postgres)

---

## Context

ExcelEx will hold multiple competing courier companies' shipment, customer and financial data in one PostgreSQL database (foundation §8.2). The project instructions state the requirement without hedging: a user from one client must never read, modify, infer or reference data belonging to another client, and isolation must be enforced in services, repositories, database constraints, cache keys, queue jobs, storage paths, authorization and tests.

They also forbid the obvious cheap implementation — manual `clientId` filters scattered through controllers — and require one canonical client-context boundary.

The design question is therefore not *whether* to scope queries but *how many independent things must fail* before one client sees another's data. With application-layer scoping alone, the answer is one: a single forgotten filter, a raw query written under time pressure, a reporting script, or an ORM bug. For a platform sold to third parties, one is not enough.

## Decision

Isolation is enforced at six layers, of which two are independent barriers at the data layer.

### Layer 1 — Request context (canonical boundary)

Client identity is resolved once per request from the trusted hostname (ADR-0001) and sealed into an immutable `RequestContext` held in `AsyncLocalStorage`:

```ts
interface RequestContext {
  readonly requestId: string
  readonly hostKind: 'public' | 'platform' | 'client'
  readonly clientId?: string
  readonly actor?: { id: string; kind: 'platform' | 'client' | 'customer' }
  readonly branchScope: readonly string[] | 'all'
  readonly ip: string
  readonly userAgent: string
}
```

It is never passed as a parameter through the call stack and never mutated after sealing.

### Layer 2 — Prisma client extension

An extension intercepts `$allOperations`. For any model carrying `clientId`:

- reads have `clientId` injected into `where`
- writes have `clientId` injected into `data` and validated against context
- absent context throws `MissingClientContextError` — the query never reaches the database

The single escape hatch is `prisma.$asPlatform(reason, fn)`. It is callable only from `apps/api/src/platform/**` (enforced by an ESLint import-boundary rule), requires a stated reason, and writes a `platform_audit_events` row on every invocation. Support access is not an exception to the audit trail; it is the reason the audit trail exists.

### Layer 3 — PostgreSQL row-level security

Every client table:

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <table> FORCE  ROW LEVEL SECURITY;

CREATE POLICY client_isolation ON <table>
  USING       (client_id = nullif(current_setting('app.client_id', true), '')::uuid)
  WITH CHECK  (client_id = nullif(current_setting('app.client_id', true), '')::uuid);
```

Four details carry the whole design:

- **`FORCE`** — table owners are exempt from RLS by default; `FORCE` removes that exemption. The most common way to deploy RLS that does nothing is to leave the application connected as the owner. Note that `FORCE` does *not* constrain superusers or roles with `BYPASSRLS`, which is why the runtime role must be neither.
- **`nullif(...)`** — `current_setting(..., true)` returns `NULL` when the GUC is unset, and `NULL = client_id` denies the row, which fails closed correctly. But if the variable is ever set to an empty string, `''::uuid` raises `invalid input syntax for type uuid` rather than returning `NULL`. `nullif` makes the empty case fail closed instead of failing loudly at query time.
- **`WITH CHECK` stated explicitly** — for a `FOR ALL` policy, PostgreSQL already reuses the `USING` expression to validate new rows when `WITH CHECK` is omitted, so writes are not unprotected by default. It is written out anyway so the new-row rule never silently inherits a visibility rule that later changes, and because `INSERT`-specific policies require it.
- **Three database roles** — `excelex_owner` (migrations only), `excelex_app` (runtime, non-owner, non-superuser), `excelex_readonly`. Two connection strings, `DATABASE_MIGRATION_URL` and `DATABASE_URL`. The application never holds migration privileges.

The session variable is set with `SET LOCAL` inside a Prisma interactive transaction, so it cannot leak across pooled connections. A session-level `SET` (without `LOCAL`) would persist on a pooled connection and leak client context to the next request that borrows it; an integration test asserts that no such statement exists anywhere in the codebase. Prisma's interactive transactions default to a five-second timeout, which now applies to every client-scoped request — it is configured explicitly rather than inherited.

### Layer 3b — Platform tables

RLS protects client tables, which by definition leaves platform tables (`clients`, `subscriptions`, `platform_users`, `platform_audit_events`) outside its scope. Since `excelex_app` is the role every client request runs as, a blanket grant would let any client request read the full customer list and the platform administrators' password hashes.

Platform tables are therefore **revoked from `excelex_app`** entirely. Platform administration connects as a distinct `excelex_platform` role, and the small number of platform reads a client request legitimately needs — client status, hostname resolution, plan limits — are exposed through `SECURITY DEFINER` functions that return only those columns. The coverage check in Layer 4 asserts both halves: every client table has a policy, and every platform table is either policy-protected or explicitly revoked.

### Layer 4 — Policy generation and coverage checking

RLS policies are generated from the Prisma schema by `tools/generate-rls.ts` and emitted into migrations. A CI check asserts that the set of models carrying `client_id` and the set of tables carrying a policy are **identical**. Adding a client model without a policy fails the build on the day the model is added.

### Layer 5 — Structural constraints

- Every unique constraint on a client table leads with `client_id`
- Foreign keys between client tables are composite, referencing `(client_id, id)`, with two conditions that are easy to get wrong: the referenced columns need a UNIQUE **constraint**, not merely a unique index (Prisma's `@@unique` emits one; a hand-written migration must too), and nullable relations need `MATCH FULL`, because the default `MATCH SIMPLE` skips verification entirely when any referencing column is NULL — an optional `branch_id` would otherwise go unchecked
- Audit tables have `UPDATE` and `DELETE` revoked from `excelex_app`

### Layer 6 — Everything that is not the database

- **Cache:** `ClientCacheService` with a mandatory `t:<clientId>:` prefix. The raw Redis client is not injectable into domain services.
- **Queues:** every payload extends `ClientJobData`; the worker re-seals `RequestContext` before the handler runs, so a job faces the same boundary as an HTTP request.
- **Storage:** keys are `clients/<clientId>/…`, derived from context and never from input.
- **Tests:** a cross-client suite enumerates client models from the Prisma DMMF at runtime and asserts denial through the service layer *and* zero rows through raw SQL under `excelex_app`. Enumerating from the DMMF rather than a hand-written list is what makes coverage automatic for models added in later phases.

## Alternatives considered

**Prisma extension only.** Simpler, faster, no transaction wrapping, no role management. Rejected because the database would have no opinion about client isolation: any raw query, migration script, reporting tool or future service bypasses the only barrier. The failure mode is silent and discovered by a customer.

**RLS only, thin application layer.** Strongest database guarantee with the least application code. Rejected as the sole mechanism because errors surface as empty result sets rather than explicit failures, which is genuinely hard to debug, and because every administrative path then needs a deliberate bypass role — more bypass surface, not less.

**Database per client.** Strongest isolation available. Rejected in the baseline (§8.2) and here: it complicates migrations across hundreds of clients, blocks centralised platform reporting, and multiplies connection overhead. Worth revisiting only for a specific enterprise client with a contractual requirement.

**Schema per client.** A middle path, but PostgreSQL performance degrades with thousands of schemas, Prisma support is awkward, and migration fan-out is the same problem as database-per-client at smaller scale.

## Consequences

**Positive.** Two independent barriers: an application bug alone cannot leak data, and a database misconfiguration alone cannot either. Coverage for new models is automatic. Cross-client leakage becomes a build failure rather than an incident.

**Negative — stated plainly.** Every client-scoped request runs its database work inside an interactive transaction to carry `SET LOCAL`, costing an extra round trip and holding a connection for the request's database duration. PgBouncer in transaction-pooling mode is compatible; session pooling is not required. Role management must be correct in every environment, and a managed PostgreSQL provider that restricts role creation or `FORCE ROW LEVEL SECURITY` would invalidate part of this design — hence DEC-010, which must be verified before step S5.

Two second-order costs follow from the transaction wrapping and are easy to miss:

- **Test isolation cannot use rollback transactions** for anything exercising the client path, because Prisma does not nest `$transaction`. A test that wraps the system under test in an outer transaction would either fail or silently bypass the `SET LOCAL` it is meant to be validating. Client-path tests use truncation or template-database cloning; rollback isolation is reserved for pure repository tests.
- **Composite foreign keys cost more in the ORM than in the database.** Every relation carries `clientId` as a shared relation scalar, which makes nested `create` and `connect` awkward and interacts directly with the extension that injects `clientId` into `data`. This is proven at S5 on one relation before the pattern is applied schema-wide.

**Measurement commitment.** Benchmark at S5. If median client-scoped request latency rises by more than 15 ms, revisit connection-pool sizing before revisiting the design. The cost is accepted knowingly (DEC-007), not discovered later.

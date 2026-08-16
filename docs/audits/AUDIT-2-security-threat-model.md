# Audit 2 — Phase 1 Security Threat Model

**Type:** Read-only adversarial threat model of the Phase 1 foundation **design**
**Target:** Revision 2 planning documents and ADRs
**Date:** 16 August 2026
**Auditor context:** Isolated agent context, run separately from and with no visibility of Audit 1
**Files changed by this audit:** none

**Classification rule applied.** No threat is classified as an implementation defect merely because Phase 1 code does not exist. Every finding is exactly one of:

1. **Design defect** — the documented mechanism is unsafe, contradictory, or does not deliver the property the documents claim for it.
2. **Missing design control** — the plan should specify a control before implementation begins, and does not.
3. **Implementation verification requirement** — the design is reasonable, but Phase 1 must prove it through specific code or tests.
4. **Accepted residual risk** — cannot be fully eliminated; must be documented, monitored or contractually managed.

Every finding names the trust boundary, the attack path, the enforcing component, a concrete verification, and whether it blocks implementation or closes before Phase 1 acceptance.

---

## Position

This is an unusually good planning package: the two-barrier isolation model, `FORCE ROW LEVEL SECURITY` with a non-owner runtime role, the `__Host-` cookie reasoning, DMMF-driven coverage, and the honest audit history in §16 put it above most Phase 1 designs. But the design's central claim — *two independent barriers, so one bug cannot leak data* — does not survive contact with its own details.

Three defects are structural rather than cosmetic:

- the platform/tenant table classification is **inferred from the presence of a `tenant_id` column**, which mis-classifies `tenant_hostnames`, `subscriptions` and `support_access_sessions` as tenant tables and hands the tenant runtime role write access to the routing table and the billing table;
- there is **no specified data path at all** for the cross-tenant reads Phase 1 itself requires — the outbox poller, retention purge, usage aggregation, session sweep, platform reporting, support access — under a role model that forbids `BYPASSRLS`;
- the **queue design makes a Redis payload an authority on tenant identity**, which is the same trust the foundation forbids the browser.

Alongside those, the isolation story has one uncontested single point of failure the documents never name: an **in-process cache** (DataLoader, memoization, Next.js Data Cache, a singleton field) sits behind *both* barriers, so a cache hit leaks across tenants with nothing in the way.

Nine items block code generation; the rest can close before Phase 1 acceptance. Nothing here suggests the architecture is wrong — it suggests the specification is roughly 85% complete and the missing 15% is concentrated exactly where the money is.

---

## Surface 1 — Cross-tenant data escape

### CT-1 · CRITICAL · Class 1 (design defect) · **BLOCKS S5**
**Platform/tenant table classification is inferred from a column, and the inference is wrong for three tables.**

- **Trust boundary:** tenant runtime role (`excelex_app`) → platform control-plane data.
- **Attack path:** ADR-0002 Layer 4 and plan §4.3/§11-criterion-10 define the generator and coverage check over *"the set of models carrying `tenant_id`"*. Plan §4.1 declares `tenant_hostnames`, `subscriptions` and `support_access_sessions` platform-scoped — yet all three necessarily carry a `tenant_id` (ADR-0001 shows it explicitly). The generator therefore emits an RLS policy instead of the `REVOKE ALL`, and the coverage check passes because both halves of its assertion are satisfied. `excelex_app` retains the blanket DML grant, filtered only by `tenant_id = mine`. Concretely: (a) any path reachable from a tenant request can `INSERT INTO tenant_hostnames (tenant_id, hostname) VALUES (me, 'admin.excelex.in')` — `WITH CHECK` is satisfied because `tenant_id` is mine, and the reserved-name constraint lives on `tenants.slug`, not here (HH-2) — after which the platform admin host resolves to the attacker's tenant, or is denied to ExcelEx by the global `UNIQUE(hostname)`; (b) the same path can `UPDATE subscriptions SET plan_id = <enterprise>`, defeating every quota in §6.4; (c) it can `INSERT INTO support_access_sessions` to manufacture the audit record of a support grant.
- **Enforcing component:** `tools/generate-rls.ts` plus the `check:rls-coverage` task in `packages/database`.
- **Verification:** an integration test iterating every table in `pg_tables` asserting `has_table_privilege('excelex_app', tbl, priv)` equals the value declared by an **explicit** per-model classification annotation — not by column inspection. Any unclassified table fails. Plus a targeted test: as `excelex_app` with `app.tenant_id` = tenant A, attempt insert/update/select on the three tables and assert `permission denied for table`.
- **Correction:** replace column-presence inference with a declared scope on every Prisma model (`/// @scope(platform)` / `/// @scope(tenant)`), make an unclassified model a build failure, and make the coverage check read live `information_schema` grants rather than generated migration text. Add `CODEOWNERS` on the classification file.

### CT-2 · HIGH · Class 1 (design defect — internal contradiction) · **BLOCKS S5 and S10**
**No specified data path exists for the cross-tenant reads Phase 1 itself requires.**

- **Trust boundary:** background/platform execution context → all tenants' data.
- **Attack path:** RLS denies every row when `app.tenant_id` is unset; `excelex_app`, `excelex_platform` and `excelex_readonly` are all explicitly non-`BYPASSRLS`. Yet Phase 1 ships the outbox poller (§8.2 — must drain `outbox_events`, a declared tenant table, across all tenants), the retention/purge job (§10.3), usage-counter aggregation (§6.4), session expiry sweeping (§6.1), storage-ledger reconciliation (§8.5) and support access. None can read anything as specified. The implementer's options are (i) grant `BYPASSRLS` to a job role, silently deleting Barrier 2 for every job; (ii) loop `SET LOCAL` per tenant, requiring a read of `tenants` — revoked from `excelex_app`; or (iii) run jobs as `excelex_owner`, which holds migration privileges. **The design will get option (i).**
- **Enforcing component:** `packages/database` role model plus job scheduling in `apps/api/src/core`.
- **Verification:** a startup assertion in every environment that `pg_roles.rolbypassrls = false` for every runtime role; and an integration test booting the worker entrypoint asserting the outbox poller drains events for two tenants while a direct `SELECT * FROM outbox_events` under the same role returns only the current context's rows.
- **Correction:** specify a fourth runtime role `excelex_jobs` with an *additive, per-table* permissive policy `USING (true)` on the narrow set a global job legitimately scans (`outbox_events`, `usage_counters`, `sessions`) and nothing else — so the bypass is enumerable in `pg_policies` rather than a role attribute that bypasses everything. Alternatively make `outbox_events` platform-scoped. Decide it in the ADR before S5; the coverage check must then assert no policy other than these declared ones uses `USING (true)`.

### CT-3 · HIGH · Class 1 (design defect) · **BLOCKS S5**
**`SET LOCAL app.tenant_id` cannot take a bind parameter, so the canonical boundary is a string-interpolated statement.**

- **Trust boundary:** application → the SQL execution context that defines the tenant boundary.
- **Attack path:** PostgreSQL's `SET` accepts only literals — `SET LOCAL app.tenant_id = $1` is a syntax error. Every Prisma RLS implementation therefore reaches for `$executeRawUnsafe(\`SET LOCAL app.tenant_id = '${tenantId}'\`)`. The design mandates `SET LOCAL` and never mentions this. If `tenantId` reaches that statement without UUID validation — from a queue payload (Q-1), a `$asPlatform` argument, a support-session record, or a seed script — the value `x'; SET LOCAL app.tenant_id = '<victim>` re-points the entire request's RLS context, and every subsequent statement in the transaction, including those through the Prisma extension, executes against the victim with both barriers satisfied.
- **Enforcing component:** the tenant-context setter in `packages/database` (a single file).
- **Verification:** unit test feeding `tenantId` values containing quotes, semicolons, newlines and a valid-prefix-plus-injection payload, asserting rejection before any SQL is issued; plus an integration test asserting `current_setting('app.tenant_id')` equals the sealed context value after a hostile input.
- **Correction:** mandate `SELECT set_config('app.tenant_id', $1, true)` via a parameterised `$queryRaw` (transaction-local when the third argument is `true`), require a UUID-format assertion at `RequestContext` sealing time, and lint-ban `$executeRawUnsafe`/`$queryRawUnsafe` outside an allowlisted file. Write the exact statement into ADR-0002.

### CT-4 · HIGH · Class 2 (missing design control) · **BLOCKS S5**
**The `SECURITY DEFINER` accessors are deliberate holes through the platform-table revoke, and nothing about them is specified.**

- **Trust boundary:** `excelex_app` → platform tables, via functions running as their owner.
- **Attack path:** plan §4.2 and ADR-0002 Layer 3b hand `excelex_app` functions for "tenant status, hostname resolution, plan limits". Signatures, `search_path`, `EXECUTE` grants and owner are all unstated. Three failures follow: (a) a function without `SET search_path = pg_catalog, public` is the textbook `SECURITY DEFINER` escalation — any object resolution the caller can influence executes as the definer; (b) `EXECUTE` defaults to `PUBLIC`, so the accessors are callable by `excelex_readonly` and any future role; (c) an accessor taking a caller-supplied tenant id — the natural signature for `get_plan_limits(tenant_id uuid)` — lets any tenant read any other tenant's plan, status and limits, which is exactly the competitive intelligence the platform sells against.
- **Enforcing component:** the accessor migration emitted by `tools/generate-rls.ts`.
- **Verification:** extend the coverage check to enumerate `pg_proc WHERE prosecdef = true` and assert for each: explicit `proconfig` containing `search_path`, owner is a declared role, `EXECUTE` revoked from `PUBLIC` and granted only to named roles, and the name appears in a committed allowlist. Plus a negative test calling each accessor as tenant A with tenant B's identifier, asserting denial or empty.
- **Correction:** specify the three accessor signatures verbatim in ADR-0002, each pinning `search_path`, each revoking `EXECUTE` from `PUBLIC`, and none accepting a tenant identifier from the caller.

### CT-5 · HIGH · Class 2 (missing design control) · **BLOCKS S6**
**Any in-process cache sits behind both barriers; a cache hit crosses tenants with nothing in the way.**

- **Trust boundary:** request A's data → request B's response, entirely inside one Node process.
- **Attack path:** the design carefully scopes Redis (`t:<tenantId>:`), queues, storage and SQL. It says nothing about *in-process* memoization, and that is the one place neither the extension nor RLS can help, because the second read never reaches the database. Concretely: a `DataLoader` batching `branch.findMany({ where: { id: { in: ids } } })` keyed by `id`; an `lru-cache` on permission resolution keyed by `userId`; a Nest singleton storing `this.tenantId` across an `await`; a module-level `Map` caching plan limits by `planId`. Tenant A warms the entry, tenant B requests the same key, B receives A's row. Foundation §14 pins "a tenant can never access another tenant's record" as a critical invariant; this defeats it while every test in §9 passes, because the cross-tenant suite drives fresh queries.
- **Enforcing component:** `packages/database` (a `TenantScopedMemo` primitive) plus the ESLint boundary config in `packages/eslint-config`.
- **Verification:** (a) `no-restricted-imports` banning `dataloader`, `lru-cache`, `p-memoize`, `quick-lru` and `nestjs-cls` outside the tenancy module, with `--report-unused-disable-directives` and a CI grep forbidding inline disables; (b) an integration test that, for every registered memoizer, performs the identical id-keyed lookup under two sealed contexts and asserts distinct results; (c) an ESLint rule forbidding non-`readonly` instance fields on default-scoped `@Injectable()` classes.
- **Correction:** add a Layer-6 bullet to ADR-0002 stating in-process caches carry the same mandatory `tenantId` key prefix as Redis, and ship the primitive at S6 rather than after the first Phase 2 incident.

### CT-6 · MEDIUM · Class 3 (implementation verification) · Before Phase 1 acceptance
**`findUnique` cannot carry a non-unique filter, and the tempting workaround exempts it from Barrier 1.**

- **Trust boundary:** Prisma extension → database.
- **Attack path:** Prisma rejects a `where` on `findUnique`/`update`/`delete` containing non-unique fields. Injecting `tenantId` throws a validation error, and the obvious fix is to exempt unique-by-id operations — at which point Barrier 1 is off for the most common read shape in the codebase, and only RLS stands between tenants. If RLS is also mis-scoped for that table (CT-1) or the context transaction was skipped, the read succeeds.
- **Enforcing component:** the `$allOperations` extension in `packages/database`.
- **Verification:** with RLS policies dropped in a scratch database (RLS-4), assert `findUnique`, `update` and `delete` targeting another tenant's primary key all return null or throw through the service layer — proving Barrier 1 independently rather than observing RLS doing the work.
- **Correction:** the extension must rewrite `findUnique` → `findFirst` and `update`/`delete` → guarded `updateMany`/`deleteMany` with an affected-row assertion. State this in ADR-0002 Layer 2.

---

## Surface 2 — Host-header manipulation and tenant resolution

### HH-1 · HIGH · Class 1 (design defect) · **BLOCKS S2 (Nginx config) and S6**
**"`X-Forwarded-Host` with a configured trusted-proxy hop count" is not a real mechanism.**

- **Trust boundary:** the internet → the header the entire tenancy model derives identity from.
- **Attack path:** hop counting is a property of `X-Forwarded-For`, a comma-separated list with defined append semantics. `X-Forwarded-Host` has no list semantics and no hop concept; ADR-0001 §4 and `TRUSTED_PROXY_HOPS=1` describe a control that does not exist, which is worse than describing none. Nginx forwards unrecognised client headers upstream by default. If `infrastructure/nginx/` omits `proxy_set_header X-Forwarded-Host $host;` — or sets it from `$http_x_forwarded_host` — a request to `https://acme.excelex.in` carrying `X-Forwarded-Host: globex.excelex.in` arrives at Nest with that header intact. With Express `trust proxy` enabled, `req.hostname` returns the attacker's value, `tenant_hostnames` resolves globex, `SET LOCAL app.tenant_id = globex` is issued, and both barriers now agree the request belongs to globex. Same family: `Forwarded:`, `X-Forwarded-Server`, `X-Original-URL`, `X-Rewrite-URL`, `x-middleware-subrequest`.
- **Enforcing component:** `infrastructure/nginx/` (must unconditionally overwrite) and `TenantResolutionMiddleware` (must prefer the connection `Host` and reject list-valued or duplicated forwarded hosts).
- **Verification:** extend criterion 4 into a fixture table driven **through the real Nginx container**: for each of `X-Forwarded-Host: globex.lvh.me`, a comma-separated pair, two separate `X-Forwarded-Host` headers, `Forwarded: host=globex.lvh.me`, `X-Original-URL: /`, `x-middleware-subrequest: 1` — addressed to `https://acme.lvh.me` — assert the resolved tenant is acme (or 400) and that a security audit event is written. Add a config test asserting `proxy_set_header X-Forwarded-Host $host;` in every server block.
- **Correction:** rewrite ADR-0001 §4 to the actual mechanism: Nginx overwrites `X-Forwarded-Host` and `X-Forwarded-Proto` unconditionally and strips inbound `Forwarded`, `X-Original-URL`, `X-Rewrite-URL` and `x-middleware-subrequest`; the application treats exactly one forwarded-host value as authoritative and rejects any request bearing more than one. Delete `TRUSTED_PROXY_HOPS` or redefine it as applying to `X-Forwarded-For` only.

### HH-2 · HIGH · Class 1 (design defect) · **BLOCKS S5**
**The reserved-name check constraint is on the wrong table.**

- **Trust boundary:** data entry → the host-to-tenant routing authority.
- **Attack path:** ADR-0001 §1 makes `tenant_hostnames` the routing authority and explicitly rejects slug parsing. ADR-0001 §3 and plan §4.2 then enforce the reserved list with a check constraint on `tenants.slug`. Slugs no longer route anything. Any row reaching `tenant_hostnames` — via CT-1's grant, a platform admin's registration (criterion 5), a seed script, or the DEC-011 custom-domain flow — can carry `admin.excelex.in`, `www.excelex.in` or `api.excelex.in` with no database-level obstacle. Registering `admin.excelex.in` against a tenant either hijacks the platform console's classification or permanently denies it to ExcelEx via the global `UNIQUE(hostname)`.
- **Enforcing component:** the `tenant_hostnames` migration in `packages/database`.
- **Verification:** an integration test attempting a direct `INSERT INTO tenant_hostnames (...) VALUES (...,'admin.excelex.in')` as `excelex_platform`, bypassing the service layer, asserting a constraint violation; repeated for every reserved entry and the bare base domain.
- **Correction:** move the constraint to `tenant_hostnames` — a generated column extracting the label preceding `APP_BASE_DOMAIN` with `CHECK (label <> ALL (reserved))`, or a `BEFORE INSERT OR UPDATE` trigger. Keep the slug constraint too; it costs nothing.

### HH-3 · HIGH · Class 2 (missing design control) · Before S7 acceptance
**Absolute URLs in invitation and activation email are not specified to come from a trusted source.**

- **Trust boundary:** attacker-influenced request host → the delivery address of a single-use credential.
- **Attack path:** §6.2 and criterion 6 build invitation-by-email in Phase 1; nothing states where the link's origin comes from, and the default implementation builds it from the request host. An attacker then either uses HH-1 to poison the host on a tenant-admin-triggered invite, or hits any unauthenticated token-issuing endpoint with a poisoned host, causing the 32-byte activation token — which grants first-login control of a tenant staff account — to be mailed as a link to an attacker-controlled origin. The victim clicks; the token is in the attacker's access log.
- **Enforcing component:** a `UrlBuilderService` in `apps/api/src/core`, sourcing the origin from `APP_BASE_DOMAIN` plus the tenant's `is_primary` hostname row.
- **Verification:** an integration test issuing an invitation and a password reset with `X-Forwarded-Host: attacker.example` and `Host: attacker.example`, capturing the message in Mailpit, asserting the link origin equals the tenant's primary hostname. Extend criterion 6.
- **Correction:** state in ADR-0003 §7 that all outbound links are constructed from configuration plus the primary hostname row, never from request state, and lint-ban `req.headers.host` outside the resolution middleware.

### HH-4 · MEDIUM · Class 1 (design defect) · Before Phase 1 acceptance
**404 / 403 / 402 differentiation is a tenant and payment-status enumeration oracle.**

- **Trust boundary:** unauthenticated internet → the platform's customer list and its tenants' commercial standing.
- **Attack path:** ADR-0001 §2 returns 404 for an unmatched host; plan §5.1 returns "403 / 402" for a matched-but-non-active tenant. An unauthenticated attacker scripts `curl -sI https://<candidate>.excelex.in/` over a dictionary of Indian courier company names and partitions them into three sets: not a customer (404), a customer in good standing (200), and a customer suspended or expired (403/402). The tenants are direct competitors. "Which of my rivals uses ExcelEx, and which is behind on payment" is saleable intelligence, and 402 specifically encodes billing status in an HTTP status code.
- **Enforcing component:** `TenantResolutionMiddleware` plus the global exception filter.
- **Verification:** a table-driven API test asserting that for unauthenticated requests to {unknown host, suspended, expired, closed, active} the status code, body, `Content-Length` and header set are byte-identical for all non-active and unknown cases, and that response-time distributions overlap.
- **Correction:** collapse all unauthenticated non-active outcomes into the unknown-host response. Surface 402/403 only *after* authentication, where the actor has proven membership. Record this in ADR-0001 as a deliberate choice, because the natural implementation does the opposite.

### HH-5 · MEDIUM · Class 2 (missing design control) · Before S4/S6 acceptance
**Base-domain suffix matching and host normalisation have no specified fixture set.**

- **Trust boundary:** raw `Host` string → host classification.
- **Attack path:** ADR-0001 §2 says "matching against the configured base domain". The naive implementation is `host.endsWith(APP_BASE_DOMAIN)`, which matches `attackerexcelex.in` for base `excelex.in`. Downstream the `tenant_hostnames` lookup fails closed, so this is not directly a data escape — but the *classification* branch runs first, and a classifier that strips the suffix to derive a label can mis-classify. Related normalisation gaps: trailing dot, embedded port, uppercase, raw punycode versus Unicode, over-long label.
- **Enforcing component:** the host classifier in `apps/api/src/core/tenancy`, mirrored in `apps/web` middleware.
- **Verification:** the S4 line "host classification unit-tested" must name a fixture table: `excelex.in`, `www.excelex.in`, `admin.excelex.in`, `acme.excelex.in`, `attackerexcelex.in`, `acme.excelex.in.evil.com`, `ACME.EXCELEX.IN`, `acme.excelex.in.`, `acme.excelex.in:443`, `acme.admin.excelex.in`, `xn--...`, empty, and a 300-character label — each with an asserted classification. The same fixture file is consumed by both API and web suites so the two implementations cannot drift.
- **Correction:** specify the match as `host === base || host.endsWith('.' + base)` after lowercasing, punycode-normalising, stripping any port and rejecting a trailing dot.

### HH-6 · MEDIUM · Class 2 (missing design control) · Before Phase 1 acceptance
**Hostname retirement and reuse after tenant closure is unspecified.**

- **Trust boundary:** a closed tenant's identity → a new tenant occupying the same hostname.
- **Attack path:** §10.3 introduces `status = closed`. `tenant_hostnames.hostname` is globally `UNIQUE` with no retirement concept. When acme closes and the row is deleted, an attacker registers "Acme Logistics" as a new tenant and claims `acme.excelex.in`, receiving: bookmarked links, in-flight password-reset and invitation emails still within their 72-hour TTL, browser-autofilled credentials for the old acme's staff, and any carrier or customer webhook still configured to that host. Old sessions are rejected by the tenant-id binding — that part holds — but credential capture does not require a session.
- **Enforcing component:** the hostname registration service in `apps/api/src/platform` plus a `retired_at` column.
- **Verification:** an integration test that closes a tenant, attempts to register its hostname to a second tenant within the quarantine window asserting rejection, then asserts success after the window; plus a test that all outstanding invitation and reset tokens are invalidated at closure.
- **Correction:** soft-retire hostname rows with a quarantine exceeding the maximum credential TTL (≥72 hours, recommend 90 days), invalidate all outstanding tokens at closure, and add both to the §10.3 offboarding sequence.

### HH-7 · MEDIUM–HIGH · Class 2 (missing design control) · Before S4 acceptance
**Next.js middleware is a second, independent implementation of a security-critical decision, in a component with a documented bypass class.**

- **Trust boundary:** browser → the web tier's choice of route group and its server-side data fetching.
- **Attack path:** §7.1 has Next middleware resolve the host, classify it and rewrite to `(public)`/`(platform)`/`(tenant)`/`(portal)` — the same decision `TenantResolutionMiddleware` makes, implemented twice, with no shared fixture. Next.js middleware has a known bypass class (the `x-middleware-subrequest` header, CVE-2025-29927) where a crafted header causes middleware to be skipped entirely; if middleware selects the platform versus tenant shell, skipping it serves the wrong shell. The design never states whether the web tier *enforces* anything or merely routes.
- **Enforcing component:** `apps/web` middleware plus `infrastructure/nginx/`.
- **Verification:** an E2E asserting that a request to a tenant host with `x-middleware-subrequest` set (and with middleware forcibly disabled in a test build) renders no authenticated data, because every authenticated fetch is re-authorised server-side by the API; plus an Nginx config test asserting the header is stripped inbound.
- **Correction:** state in §7.1 that Next middleware is presentation routing only and enforces nothing; all authorisation and tenant resolution is re-derived by the API from the forwarded host on every data fetch. Strip the header at Nginx. Share the HH-5 fixture file between both classifiers.

### HH-8 · LOW–MEDIUM · Class 2 (missing design control) · Before S12
**Per-subdomain TLS certificates publish ExcelEx's entire customer list to Certificate Transparency.**

- **Trust boundary:** the platform's commercial customer list → public CT logs.
- **Attack path:** if `<slug>.excelex.in` certificates are issued individually (the default for most ACME automation), every tenant onboarding is published to `crt.sh` within minutes, timestamped. HH-4's fix is then pointless, because enumeration moves to a public log. DEC-011 (custom domains) reintroduces the disclosure by design and should say so.
- **Enforcing component:** `infrastructure/nginx/` and the issuance procedure in `infrastructure/deployment/`.
- **Verification:** an operational check asserting the production certificate's SAN set is `excelex.in, *.excelex.in` and contains no per-tenant name; a CT-monitoring alert on any newly issued certificate naming a subdomain.
- **Correction:** mandate a wildcard certificate, and add the CT-disclosure consequence to DEC-011.

---

## Surface 3 — Redis and cache isolation

The mandatory `t:<tenantId>:` prefix with the raw client withheld from domain services is the right primitive; no finding against it.

### CA-1 · HIGH · Class 1 (design defect) · **BLOCKS S6**
**The hostname cache has no TTL and no cross-process invalidation story, and it is the one cache entry that maps an attacker-supplied string to a tenant identity.**

- **Trust boundary:** Redis cache state → the tenant identity sealed into `RequestContext`.
- **Attack path:** ADR-0001 §1 specifies `host:<hostname>` cached "with explicit invalidation on tenant or hostname mutation" — no TTL, no key version, no fail-mode. Three failures: (a) a missed or failed invalidation is *permanent*; after a hostname is reassigned (HH-6) or a tenant suspended, the stale entry keeps resolving requests to the previous tenant indefinitely, and the middleware seals that identity before any guard runs — the request then passes both barriers as the wrong tenant; (b) invalidation must reach every API process, every worker and the Next.js tier, and the design specifies neither pub/sub fan-out nor a version key, so a multi-container deploy has an unbounded per-node stale window; (c) if the cached value carries tenant *status*, §5.1's "reject non-active tenant status" is evaluated against cache state, so suspending a tenant for non-payment does not take effect until an invalidation that may never arrive. Failure mode on Redis unavailability or a malformed cached value is unstated; it must fail closed to a database read, never open to a default tenant.
- **Enforcing component:** `TenantResolutionMiddleware` and the hostname cache provider — the one legitimate holder of a raw Redis client, which should be named as such in ADR-0002 Layer 6.
- **Verification:** (a) an integration test with two API processes that mutates `tenant_hostnames` in one and asserts the other resolves the new mapping within the stated bound; (b) a test that suspends a tenant and asserts rejection within one TTL without a restart; (c) a chaos test that kills Redis mid-run and asserts requests fail closed to a database lookup or 503; (d) a test that writes a corrupted value at `host:acme.lvh.me` and asserts rejection rather than coercion.
- **Correction:** bounded TTL (60s is ample), cache only `hostname → tenantId` — never status, which is read per request through the CT-4 accessor — add a global key-version counter bumped on any hostname mutation, and state the fail-closed behaviour explicitly in ADR-0001.

### CA-2 · MEDIUM · Class 2 (missing design control) · Before S7 acceptance
**Cache-aside session resurrection defeats the "revocation is immediate and total" claim, and the cached session may not carry the fields the host-binding check needs.**

- **Trust boundary:** a revoked session → continued authenticated access.
- **Attack path:** classic cache-aside race — request A misses Redis, reads the row from PostgreSQL; concurrently an administrator revokes the session, deleting the Redis key then the row; request A writes the value it read back into Redis. The session is resurrected for the full TTL, surviving staff deactivation, tenant suspension and incident-response revocation — the three cases the ADR cites as the reason for opaque sessions. Second issue: ADR-0003 §3's host-binding check compares the session's `tenant_id` and `host`; if the cached representation omits those fields (an easy omission, since the cache exists to avoid a join), the check silently degrades to "is this session id known".
- **Enforcing component:** the session store in `apps/api/src/core/auth`.
- **Verification:** a concurrency test interleaving a read-through miss with a revocation, asserting no resurrection; plus a test that tampers with the cached blob to another tenant's id and asserts rejection.
- **Correction:** revoke by writing a tombstone with a TTL exceeding the session TTL rather than deleting, or version session cache entries; mandate that `tenant_id` and `host` are part of the cached value and are checked on every request.

### CA-3 · MEDIUM · Class 2 (missing design control) · Before S12
**One Redis instance carries the hostname map, session cache, BullMQ queues and rate-limit counters, with no authentication, TLS or ACL in the specified environment surface.**

- **Trust boundary:** anything with network access to Redis → tenant identity, sessions and job authority.
- **Attack path:** `REDIS_URL=redis://localhost:6379` with no credentials. Acceptable locally; the problem is that §7.3's production boot assertions list four checks and Redis is not among them. A staging or production Redis reachable without `AUTH` gives an attacker the hostname map (CA-1), the session cache (CA-2) and job payloads (Q-1) — three independent routes to arbitrary tenant identity — from one unauthenticated service.
- **Enforcing component:** `packages/configuration` boot assertions and `infrastructure/deployment/`.
- **Verification:** a boot assertion test asserting refusal to start outside development when `REDIS_URL` lacks credentials or a `rediss://` scheme; plus a `smoke:infra` assertion that `ACL WHOAMI` is not `default` in non-development environments.
- **Correction:** add "Redis without credentials or TLS" and "storage credentials equal to a known default" to the §7.3 production boot assertions, and separate cache, session and queue keyspaces into distinct logical databases or ACL-scoped prefixes.

### CA-4 · HIGH · Class 2 (missing design control) · **BLOCKS S4 acceptance**
**Next.js caching is not addressed at all, and its defaults are exactly the cross-tenant leak.**

- **Trust boundary:** tenant A's rendered content → tenant B's browser, in the web tier.
- **Attack path:** §7.1 has Server Components fetch authenticated data through a server-side API client forwarding the session cookie. Next's Data Cache memoizes `fetch` by URL and options by default; the Full Route Cache statically renders routes it believes static; `unstable_cache` keys by its arguments. Every one of those keys omits the tenant host and the session. Tenant A loads `/dashboard`, the RSC payload or fetch result is cached, tenant B on a different host hits the same key on the same server and receives A's data — bypassing the API, the extension, RLS and every test in §9, because no database query occurs. The public tracking shell has the same problem in reverse.
- **Enforcing component:** `apps/web` — route-segment config and the server-side API client.
- **Verification:** (a) an E2E against a *warm* server that signs in as tenant A, renders every authenticated route, then signs in as tenant B in a clean context and asserts no tenant-A string appears; (b) a build-time assertion enumerating the route manifest, failing if any route under `(tenant)`, `(platform)` or `(portal)` is statically rendered or has a non-zero revalidate; (c) an ESLint rule banning `unstable_cache` and `cache: 'force-cache'` under those groups.
- **Correction:** add a subsection to §7.1: authenticated fetches use `cache: 'no-store'`; authenticated route groups declare `export const dynamic = 'force-dynamic'`; any cache key for host-varying content includes the resolved hostname; `Vary: Cookie, Host` is set on all authenticated responses at Nginx.

---

## Surface 4 — PostgreSQL RLS bypass

The `FORCE` / `nullif` / non-owner-role triad is correct and the reasoning in ADR-0002 is accurate, including the corrected `WITH CHECK` justification. The findings below are about what verifies it.

### RLS-1 · HIGH · Class 2 (missing design control) · **BLOCKS criterion 10**
**The coverage check verifies generated SQL, not live database state.**

- **Trust boundary:** the migration text → the actual state of the running database.
- **Attack path:** §4.3 and criterion 10 assert set equality between models with `tenant_id` and tables with a policy. That check passes in all of: `ENABLE` applied but `FORCE` omitted on one table; an additional permissive policy `USING (true)` added by a later migration, which ORs with the generated one and opens the table completely; `excelex_app` granted `BYPASSRLS` or membership in `excelex_owner` by an operations action; a table created in a later migration owned by a different role, so `ALTER DEFAULT PRIVILEGES FOR ROLE excelex_owner` never applied. Setup §2.3 catches only the superuser case, only in development, only manually.
- **Enforcing component:** the `check:rls-coverage` task, promoted to a runtime assertion.
- **Verification:** the check queries the live database and asserts per table `pg_class.relrowsecurity AND relforcerowsecurity`; that `pg_policies` contains exactly the generated policy and no other permissive policy; and globally `rolbypassrls = false`, `rolsuper = false` for all runtime roles, plus `pg_has_role('excelex_app','excelex_owner','USAGE') = false`. The same function runs as a startup assertion in every environment, since the CI database and the production database are different objects.
- **Correction:** rewrite criterion 10's proof as a live-database assertion and add it to `/readyz` or a boot check.

### RLS-2 · MEDIUM–HIGH · Class 1 (design defect in the verification) · Before S5 acceptance
**The design's self-declared "single highest-value test" is trivially incomplete.**

- **Trust boundary:** application SQL → the RLS session variable inside an already-scoped transaction.
- **Attack path:** the specified test asserts "no session-level `SET` (without `LOCAL`) exists anywhere in the codebase". That passes for `SET LOCAL app.tenant_id = '<other tenant>'` issued mid-transaction, for `SELECT set_config('app.tenant_id', x, false)` (session-scoped, the exact thing the test exists to prevent, spelled differently), for `RESET app.tenant_id`, and for `SET SESSION AUTHORIZATION`. Any of those in a raw query re-points the tenant boundary for the remainder of the transaction while both barriers report success.
- **Enforcing component:** the lint/grep check in `packages/testing`.
- **Verification:** replace with: the literal `app.tenant_id` appears in exactly one non-test source file (the context setter); `set_config`, `SET SESSION AUTHORIZATION`, `RESET` and the `Unsafe` raw APIs appear only in an explicit allowlist with a justification comment; `--report-unused-disable-directives` plus a CI grep forbidding inline suppression.
- **Correction:** state the strengthened rule in §5.3 and ADR-0002.

### RLS-3 · MEDIUM · Class 2 (missing design control) · Before S5 acceptance
**Views and materialized views are outside the generator, and Phase 1 is the only cheap moment to add the rule.**

- **Trust boundary:** a view owned by `excelex_owner` → RLS on the underlying tenant tables.
- **Attack path:** a view executes with the privileges and RLS context of its *owner* unless created `WITH (security_invoker = true)`. A Phase 2 reporting view over `shipments` owned by `excelex_owner` and granted to `excelex_readonly` or `excelex_app` returns every tenant's rows regardless of `app.tenant_id`. Materialized views ignore RLS entirely and cannot be `security_invoker` at all — a materialized reporting view over tenant data is a permanent, refresh-time snapshot of every tenant's data with no policy in the way. Phase 1 has no views; the generator that would forbid this is a Phase 1 deliverable.
- **Enforcing component:** the `tools/generate-rls.ts` coverage check.
- **Verification:** the check enumerates `pg_views` and `pg_matviews`, resolves dependencies via `pg_depend`, and fails if any view referencing a tenant table lacks `security_invoker = on`, or if any materialized view references a tenant table at all.
- **Correction:** add the rule to §4.3 now, while there is nothing to break.

### RLS-4 · HIGH · Class 2 (missing design control) · **BLOCKS S11**
**Nothing tests that the two barriers are independent — the suite passes if one is entirely inoperative.**

- **Trust boundary:** the design's central claim → the evidence for it.
- **Attack path:** the cross-tenant suite exercises the service layer and raw SQL with both barriers active. If the extension silently degrades — a `findUnique` exemption (CT-6), an unrecognised model, an `$extends` ordering bug — RLS covers it and the suite is green. If RLS degrades — `FORCE` missing on one table, a permissive policy added, the context transaction skipped — the extension covers it and the suite is green. The platform can reach production with one barrier, having passed the test that exists to prove it has two, and the first failure of the surviving barrier is a customer-visible leak.
- **Enforcing component:** the `test:security` harness in `packages/testing`.
- **Verification:** run the suite three times in CI — (a) both barriers active; (b) extension in pass-through mode, asserting RLS alone returns zero rows for every tenant model through raw SQL and through Prisma; (c) against a scratch database with all `tenant_isolation` policies dropped, asserting the extension alone denies every cross-tenant read and write including `findUnique`, `update`, `delete`, nested reads via `include`, and `count`/`aggregate`. Mode (c) proves Barrier 1; mode (b) proves Barrier 2. Both required checks.
- **Correction:** add this to §9 as the definition of the cross-tenant suite, and to criterion 7's proof.

---

## Surface 5 — Connection pooling and context leakage

`SET LOCAL` inside a Prisma interactive transaction with PgBouncer in transaction mode is a correct pairing, and the ADR's reasoning about session-level `SET` is right. Findings concern what the ALS boundary does not cover and where the roles physically live.

### PL-1 · HIGH · Class 2 (missing design control) · **BLOCKS S6**
**AsyncLocalStorage context *confusion* is not addressed; only context *loss* is.**

- **Trust boundary:** request A's sealed context → work performed on behalf of tenant B.
- **Attack path:** ADR-0002 Layer 1 handles absence correctly (fail closed). Presence of the *wrong* context produces no error at all. Vectors reachable in Phase 1: (a) a listener or timer registered from request scope — `emitter.on(...)`, `setInterval`, an outbox subscriber wired lazily on first use — captures the ALS store of whichever request registered it, and every subsequent invocation for the life of the process runs under that tenant's identity; (b) the outbox poller or a `TenantWorkerHost` handler invoked from inside an enqueuing request's context inherits it rather than sealing a fresh one — the design says the worker "re-seals" but not that it must first *exit* any inherited store; (c) a Nest singleton storing request state across an `await`; (d) a `Promise.all` fan-out into a shared batcher (CT-5); (e) exception filters and `finally` handlers running after the store has exited. In every case both barriers faithfully apply the *wrong* tenant.
- **Enforcing component:** the context module in `apps/api/src/core/context`.
- **Verification:** (a) an integration test enqueuing a job from inside tenant A's request with a payload naming tenant B, asserting the handler's sealed context is B — proving the store was not inherited; (b) a test registering an event listener during tenant A's request, triggering it from tenant B's, asserting the handler sees B or throws rather than silently seeing A; (c) an ESLint rule forbidding non-`readonly` instance fields on default-scoped `@Injectable()` classes and forbidding `setInterval`/`setTimeout`/`.on(` inside request-scoped paths.
- **Correction:** add to ADR-0002 Layer 1 that every job, poller, timer and event handler enters a *freshly constructed* store via `als.run()` and never inherits, and that the worker host asserts `als.getStore() === undefined` before sealing.

### PL-2 · MEDIUM · Class 4 (accepted residual, with a required mitigation) · Before S5 acceptance
**One tenant can starve every other tenant through the shared connection pool, and the only stated control is a latency threshold.**

- **Trust boundary:** tenant A's resource consumption → tenant B's availability.
- **Attack path:** every tenant-scoped request holds a pooled connection for its full database duration, and `.env.example` raises the transaction timeout to 15s — three times the Prisma default the plan discusses. A tenant issuing N concurrent expensive reports holds N connections for up to 15s each; with a default pool of `cpus*2+1`, a single tenant exhausts the pool and every other tenant receives acquisition timeouts. §6.5's per-tenant rate limiting helps at the request-count level but not at cost-per-request.
- **Enforcing component:** `TenantPrismaService` (a per-tenant in-flight semaphore) plus pool configuration.
- **Verification:** a load test at S5 saturating the pool from one tenant, asserting a second tenant's p99 stays within a stated bound; assert `pool_size × transaction_timeout` against target concurrency in the same test.
- **Correction:** add a per-tenant in-flight transaction cap, give worker and platform processes separate pools, reconcile the 15s value with the 5s discussion in §5.3, and record the residual explicitly in DEC-007.

### PL-3 · HIGH · Class 1 (design defect) · **BLOCKS S9** (cheap now, expensive later)
**The platform and tenant database roles are separated in configuration but co-resident in one process.**

- **Trust boundary:** the role separation §10.1 calls "the privilege boundary the whole isolation design rests on".
- **Attack path:** DEC-005 serves `/api/v1` same-origin on *every* host, so one `apps/api` process serves `admin.excelex.in` and `acme.excelex.in`. That process's environment therefore contains both `DATABASE_URL` and `DATABASE_PLATFORM_URL` (which holds grants on `platform_users` and their Argon2id hashes). The separation is enforced only by which Prisma client instance a code path resolves from the Nest container. A single mistake — a `@PlatformRoute()` on a route reachable from a tenant host, a host-classification bug (HH-1, HH-5), a shared service injected into both module graphs, or an SSRF in any dependency — reaches the platform client from a tenant request, and the revoke barrier of §4.2 evaporates. The design already deploys two containers from one image; a third costs almost nothing.
- **Enforcing component:** `infrastructure/deployment/` (process topology) and `infrastructure/nginx/` (host routing).
- **Verification:** an operational assertion in the deploy job that the tenant-serving container's environment does not contain `DATABASE_PLATFORM_URL` and the platform container's does not contain `DATABASE_URL`; a boot assertion enforcing the same; and a Nest module test asserting the platform Prisma provider is not resolvable from the tenant module graph.
- **Correction:** add `main.platform.ts` as a third entrypoint bound to the admin host, routed by Nginx, and amend DEC-006. If co-residency is retained, record it as an explicit accepted risk with the boot assertion above.

---

## Surface 6 — Session and cookie attacks

The `__Host-` prefix analysis is correct and is the strongest part of the design: a sibling tenant subdomain genuinely cannot set or overwrite another host's session cookie, and ADR-0003's correction of the earlier `SameSite` error is right. The explicit origin/`Sec-Fetch-Site` check is the correct CSRF mitigation given shared-site tenants.

### SC-1 · MEDIUM · Class 1 (design defect) · Before S3 acceptance
**The cookie-prefix boot assertion keys on `NODE_ENV=production`, excluding staging — the environment that mirrors production and holds real data during the restore drill.**

- **Trust boundary:** environment configuration → the browser-enforced cookie boundary.
- **Attack path:** §7.3 and setup §4 gate the assertion on `NODE_ENV=production`. §10.1 introduces a staging environment "matching production topology", auto-deployed from `main`. If staging runs with the unprefixed fallback name, a hostile or compromised tenant subdomain *can* set a `Domain=.staging.excelex.in` cookie of the same name, shadowing another tenant's session cookie; the browser sends both with no origin distinction and the server picks by header order. The one mechanism the design says does not depend on our correctness is switched off in the environment where cross-tenant tests are most likely to run against realistic data.
- **Enforcing component:** `packages/configuration` boot assertions.
- **Verification:** a config test asserting refusal to start whenever the request scheme is HTTPS (or `APP_PUBLIC_URL` begins `https://`) and the cookie name lacks the `__Host-` prefix, regardless of `NODE_ENV`.
- **Correction:** re-key every §7.3 production assertion on "not a local plain-HTTP development run" rather than on `NODE_ENV === 'production'`.

### SC-2 · MEDIUM · Class 2 (missing design control) · Before S7 acceptance
**Rotation is specified on privilege change but not on authentication.**

- **Trust boundary:** a pre-authentication session identifier → a post-authentication one.
- **Attack path:** ADR-0003 §8 lists "rotation on privilege change" and omits authentication. Any pre-auth cookie (CSRF token, login rate-limit state, locale) sharing the session identifier and elevated in place is a fixation primitive. The `__Host-` design blocks the classic sibling-subdomain route, so the remaining vectors are a network-position attacker on the plain-HTTP fallback and an XSS on the same host — narrow, but the mitigation is one line.
- **Enforcing component:** the authentication service in `apps/api/src/core/auth`.
- **Verification:** an integration test asserting the session identifier before and after successful login differ, that the pre-auth identifier is deleted server-side, and that the same holds after MFA completion and any privilege change.
- **Correction:** amend ADR-0003 §8 to "rotation on authentication, on MFA completion, and on privilege change".

### SC-3 · MEDIUM–HIGH · Class 2 (missing design control) · Before S7 acceptance
**Only the session cookie is specified to carry the `__Host-` prefix, and no rule states that a cookie is never an authorisation input.**

- **Trust boundary:** a hostile tenant subdomain → another tenant's request state.
- **Attack path:** every tenant host shares the registrable domain, so `evil.excelex.in` can set `Domain=.excelex.in` cookies the browser transmits to `acme.excelex.in`. The session cookie is immune. Every *other* cookie is not: locale, Next.js cookies, a CSRF double-submit token if ever added, and — the one that matters — anything backing the "branch switcher" in §7.1. `RequestContext.branchScope` is `readonly string[] | 'all'`; the design never says where the selected branch comes from. If it comes from a cookie or header, a hostile tenant can shadow it (RFC 6265 gives the server no way to tell which cookie came from which setter) and alter another tenant's user's effective branch scope — an authorisation input controlled by a third party.
- **Enforcing component:** the cookie-writing helper in `apps/api/src/core` and the branch-scope resolver.
- **Verification:** (a) a unit assertion enumerating every `Set-Cookie` the API and web tier emit, failing on any without the prefix; (b) an E2E setting `Domain=.lvh.me` cookies from a second tenant host and asserting no behaviour change on the victim host; (c) an integration test supplying a branch id outside the user's memberships, asserting rejection, and that branch selection can only *narrow* the memberships read from the database.
- **Correction:** state in ADR-0003 that every cookie the platform sets carries the `__Host-` prefix, and that `branchScope` is computed server-side from `user_branch_memberships` on every request, with any client-supplied selection treated as a filter within that set and never an expansion.

### SC-4 · HIGH (intra-tenant) / MEDIUM (cross-tenant) · Class 2 (missing design control) · Before S7 acceptance
**Tenant staff and tenant customers share a host, so the browser-enforced boundary the design relies on does not separate them.**

- **Trust boundary:** a tenant's external customer → that tenant's staff operations and, through it, that tenant's whole dataset.
- **Attack path:** ADR-0003 names four audiences but only three hosts: staff at `<slug>.excelex.in` and customers at `<slug>.excelex.in/portal`. Same host, same cookie name, same jar, same origin — so `__Host-` scoping, the mechanism the ADR says means "the browser, not our code, enforces that", provides exactly zero separation here. A courier's customer is often a different company, sometimes a competitor of another customer, and customer accounts are the easiest to obtain. Separation reduces entirely to `actor.kind` being checked on every staff route — precisely the "matter of server-side diligence" the ADR rejects as insufficient for tenants. The cross-tenant consequence is second-order but real: a customer who escalates to staff on tenant A obtains a fully privileged tenant-A session, which is the starting position for every other finding in this report.
- **Enforcing component:** the guard chain in `apps/api/src/core/auth` and the portal route group.
- **Verification:** a table-driven test enumerating every route from the Nest route registry **at runtime** — the same technique already used for the DMMF — asserting that a session with `actor.kind = 'customer'` receives 403 on every route not explicitly marked `@PortalRoute()`. New endpoints are then covered automatically.
- **Correction:** give the portal a distinct cookie name (`__Host-excelex_portal`) and a distinct session table, make `actor.kind` a first-class check in the guard chain, and default-deny any route without an explicit audience decorator. Add a paragraph to ADR-0003 acknowledging the portal is the one boundary the browser does not enforce.

### SC-5 · MEDIUM · Class 2 (missing design control) · Before S7 acceptance
**Login timing reveals whether a given email is staff at a given tenant.**

- **Trust boundary:** unauthenticated internet → a competitor's staff roster.
- **Attack path:** §6.2 requires generic failure messages — correct for the message, silent on timing. Argon2id at 19 MiB / 2 iterations takes tens of milliseconds and runs only when a user row is found; a missing user returns in a fraction of that. Because `users` is unique on `(tenant_id, email)`, an attacker submitting a known email against `acme.excelex.in` and `globex.excelex.in` learns which courier company employs that person, at scale, from timing alone. That is a cross-tenant inference about a competitor's workforce, and it survives the rate limiter.
- **Enforcing component:** the authentication service.
- **Verification:** assert via a spy that the Argon2 verify path is invoked on both the found-user and not-found branches (a stable assertion, unlike wall-clock timing), plus a statistical test that the response-time distributions overlap within a stated bound.
- **Correction:** always verify against a fixed dummy hash when no user is found; apply the same rule to invitation acceptance and password reset.

### SC-6 · MEDIUM–HIGH · Class 2 (missing design control) · Before S7 acceptance
**The TOTP flow is named but not specified, and it protects the highest-privilege accounts in the platform.**

- **Trust boundary:** a stolen platform-administrator password → platform administration.
- **Attack path:** §6.1 and ADR-0003 §5 say MFA is mandatory and give `platform_user_mfa` columns. Unspecified, and each is a standard failure: (a) **code replay** — `last_used_at` exists but nothing states a code valid within its window is rejected on second use, so an intercepted code is reusable for 30–90s; (b) **recovery-code storage** — if unhashed they are plaintext passwords for the highest-privilege accounts, sitting in the table `excelex_app` must be revoked from (CT-1's failure mode would expose them directly); (c) **verification-attempt rate limiting** — if MFA verification is a separate endpoint outside the login limiter, a six-digit code is brute-forceable; (d) **enrolment window** — "mandatory" must mean an un-enrolled administrator can reach exactly one endpoint and nothing else, with enrolment requiring password re-entry; (e) **step-up** — granting support access should require fresh MFA, not merely an existing session.
- **Enforcing component:** the platform authentication module.
- **Verification:** tests for same code rejected twice; recovery code single-use and stored hashed; MFA verification counted by the login limiter with progressive backoff; a platform session without `enrolled_at` receiving 403 on every route except enrolment (enumerated from the route registry); support-access grant requiring a TOTP re-challenge.
- **Correction:** add these five points to ADR-0003 §5.

### SC-7 · MEDIUM · Class 2 (missing design control) · Before S7 acceptance
**The invitation flow is specified as a token but not as a privilege grant.**

- **Trust boundary:** an invitation token → a tenant staff identity with a role.
- **Attack path:** §6.2 specifies 32 random bytes, hashed, single-use, 72-hour TTL — good. Unspecified: (a) **which roles an inviter may grant** — without a rule, a user with `tenancy.user.invite` can invite an account holding roles above their own, which is straightforward privilege escalation inside a tenant; (b) **host binding at acceptance** — accepting an acme invitation while the resolved host is globex must be rejected and audited, mirroring ADR-0003 §3 for sessions; (c) **hash choice** — a 256-bit random token should be looked up by SHA-256, not by an Argon2 comparison that would force a table scan; (d) **uniform errors** for invalid, expired, already-used and wrong-tenant, otherwise the endpoint is an invitation oracle; (e) **replay** — §8.4 nominates invitation acceptance as an idempotency exercise point, so a replayed acceptance must not create a second user or reactivate a deactivated one.
- **Enforcing component:** the invitations service in `apps/api/src/tenancy`.
- **Verification:** tests for each of (a)–(e), with (a) driven by a matrix of inviter role × invited role asserting a superset grant is refused, and (b) asserting a security audit event on the cross-host acceptance attempt.
- **Correction:** add the five rules to §6.2.

---

## Surface 7 — Queue payload tampering

### Q-1 · HIGH · Class 1 (design defect) · **BLOCKS S10**
**The worker re-seals tenant identity *from the job payload*, making a Redis value an authority equal to the trusted hostname.**

- **Trust boundary:** Redis-stored data → the sealed `RequestContext` both barriers trust.
- **Attack path:** ADR-0002 Layer 6 and §8.1 state every payload extends `TenantJobData { tenantId, ... }` and "the worker re-seals `RequestContext` before the handler runs, so a job faces the same boundary as an HTTP request." It does not face the same boundary — an HTTP request derives identity from TLS + Nginx + a database lookup; a job derives it from a JSON blob in an unauthenticated Redis (CA-3). Anyone who can write to Redis — a compromised worker container, an exposed Redis, an SSRF reaching 6379, an operator with `redis-cli`, or Bull Board's own retry path (Q-3) — edits `tenantId` in a queued job. The worker seals that identity, issues `SET LOCAL app.tenant_id = <victim>`, and the handler reads and writes the victim's data with the extension and RLS both actively cooperating. This directly contradicts foundation §8.2's rule that tenant identity comes from trusted context.
- **Enforcing component:** `TenantWorkerHost` in `apps/api/src/core`.
- **Verification:** an integration test enqueuing a job for tenant A, mutating the payload's `tenantId` to tenant B directly in Redis, running the worker, and asserting the job is rejected, dead-lettered and audited — not executed against B. Plus an assertion that Redis requires `AUTH` in non-development environments.
- **Correction:** either (a) sign the payload — HMAC over `{tenantId, jobName, businessKey, exp}` with a secret held only by the API and worker, verified before sealing; or (b) carry only a business key and re-derive `tenantId` from the persisted aggregate through a platform accessor; or at minimum (c) assert on every job that the tenant exists and is active *and* that the target entity's `tenant_id` matches the payload before any write. Option (a) is ~15 lines and preserves the payload shape. State the choice in ADR-0002 Layer 6.

### Q-2 · MEDIUM–HIGH · Class 1 (design defect) · **BLOCKS S10**
**`jobId` derived from the business key without a tenant prefix collides across tenants.**

- **Trust boundary:** tenant A's job namespace → tenant B's.
- **Attack path:** §8.1: "Jobs are idempotent by construction with a `jobId` derived from the business key." Queue names are per-environment, not per-tenant, so the `jobId` space is global. The natural business key is the domain identifier — `invoice:INV-0001`, `awb:12345678`. Tenant A enqueues `invoice:INV-0001`; tenant B enqueues the same; BullMQ deduplicates and **silently discards B's job**. Tenant B's invoice is never generated, its notification never fires, and there is no error — a cross-tenant denial of service triggered by ordinary business activity, and worse in reverse if the deduplicated job carries a payload. Secondarily, `queue.getJob(id)` becomes an existence oracle. The design applies the mandatory-prefix discipline to cache keys and storage keys and stops one step short of the queue.
- **Enforcing component:** a `tenantJobId()` helper in `apps/api/src/shared/queue`.
- **Verification:** an integration test enqueuing the identical business key for two tenants, asserting two distinct jobs are created and both handlers run; plus a type-level constraint making `jobId` constructible only through the helper, and a lint rule forbidding a raw string literal for `jobId`.
- **Correction:** add a Layer-6 bullet: `jobId`, BullMQ deduplication keys, repeatable-job keys and rate-limiter group keys all carry the mandatory `t:<tenantId>:` prefix, exactly as cache keys do.

### Q-3 · MEDIUM–HIGH · Class 2 (missing design control) · Before S10 acceptance
**Bull Board is a third-party UI with direct Redis access mounted inside the platform host, outside the guard chain, the audit spine and `$asPlatform`.**

- **Trust boundary:** platform operator → every tenant's job payloads and job execution.
- **Attack path:** §8.1 mounts Bull Board at `/platform/jobs` behind platform authentication and permissions. Bull Board is an Express router with its own routes; it does not traverse the Nest guard chain, the audit interceptor or `$asPlatform` unless each is explicitly wired to it. Consequences: job payloads — which by design carry `tenantId`, `actorId` and business keys, and in later phases customer names and financial identifiers — are rendered cross-tenant in one UI with no support-access session (SA-1) and no per-view audit record; the retry action re-executes a tenant's job and the drain action destroys queued work for every tenant, with no `platform_audit_events` row. Retry is also the cleanest exploitation path for Q-1, since Bull Board can edit and replay.
- **Enforcing component:** the Bull Board mount in `apps/api/src/platform`.
- **Verification:** API tests asserting every Bull Board route returns 404 unauthenticated and 403 without the permission; that retry and drain each write a `platform_audit_events` row naming actor, queue, job id and affected tenant; and that payload fields are redacted in the rendered response.
- **Correction:** wrap the mount in the Nest guard chain and an audit interceptor covering all mutating routes, redact payloads in the UI, and require an active support-access session for any action targeting an identifiable tenant.

---

## Surface 8 — Platform privilege escalation

### PE-1 · HIGH · Class 1 (design defect) · **BLOCKS S6**
**`$asPlatform` is one hatch covering two very different capabilities, is unlinked to support access, and is enforced only by a lint rule.**

- **Trust boundary:** platform code → all tenants' data.
- **Attack path:** three problems in one mechanism. (a) **Least privilege:** a single `$asPlatform(reason, fn)` means every platform path that legitimately needs to read `plans` or `tenants` also obtains whatever tenant-data reach the hatch confers. (b) **Enforcement:** the boundary is an ESLint import rule. ESLint does not run in production, and a single `// eslint-disable-next-line` moves the call anywhere; the plan contains no rule against inline disables. There is no runtime obstacle to calling `$asPlatform` from a tenant-request path. (c) **Accountability:** `reason` is free text supplied by the caller, unbound to a ticket, a tenant or a `support_access_sessions` row — so the audit trail records an unverified sentence. Separately, the documents never say what `$asPlatform` does at the SQL level: if it sets `app.tenant_id` to an arbitrary value, Barrier 2 is not independent for any platform-reachable path, which is the load-bearing claim of the whole ADR.
- **Enforcing component:** the Prisma extension in `packages/database` plus DI in `apps/api/src/platform`.
- **Verification:** (a) a runtime test that calling the hatch from a non-platform module throws — achieved by requiring an injected capability token only the platform module provides, a runtime control rather than a lint control; (b) a test that the tenant-data variant throws without an active, unexpired `support_access_sessions` row covering the actor and tenant; (c) an assertion that every invocation writes a `platform_audit_events` row with a non-null foreign key to that support session; (d) a CI grep forbidding inline disables of the boundary rule.
- **Correction:** split into `$asPlatformTables()` — platform tables only, no tenant-data reach, no support session required — and `$asTenant(tenantId, supportSessionId, reason)`, which requires an active support session and is the *only* way any code reads another tenant's rows. Enforce membership through an injected capability token rather than a lint rule. Document explicitly what each does to `app.tenant_id`.

### PE-2 · MEDIUM · Class 1 (overclaim) + 4 (residual) · Before S13
**"Audit rows are immutable" is not true against the threat that matters.**

- **Trust boundary:** an insider with deploy or database-owner access → the audit record of their own actions.
- **Attack path:** §4.2 and setup §2.2 revoke `UPDATE, DELETE` from `excelex_app` and `excelex_platform`. `excelex_owner` retains everything, migrations run as `excelex_owner` in a deploy job, and a migration is ordinary reviewed code. Anyone able to land a migration can rewrite or delete audit history — including the rows recording their own `$asPlatform` and support-access activity. There is no hash chain, no external append-only sink, and no detection. The generated revoke also omits `TRUNCATE` (not granted today by the default privileges, so currently safe — but a later blanket grant would silently open it).
- **Enforcing component:** an audit trigger in `packages/database` plus an export sink in `apps/api/src/core/audit`.
- **Verification:** a test that `UPDATE`/`DELETE`/`TRUNCATE` by both runtime roles are denied; a test that a `BEFORE INSERT` trigger populates `row_hash = H(prev_hash || row)`; and a scheduled verification job walking the chain and alerting on a break — proven by a test that mutates a row as owner and asserts the job fails.
- **Correction:** add the hash chain, add `TRUNCATE` to the generated revoke, ship audit events to an append-only external sink (S3 Object Lock) via the outbox, and restate the invariant honestly as "immutable to every runtime role and tamper-evident against the owner".

### PE-3 · MEDIUM · Class 2 (missing design control) · Before S9 acceptance
**No second-approver requirement on the platform actions that break tenant isolation.**

- **Trust boundary:** a single compromised or malicious platform administrator → the isolation guarantee sold to every tenant.
- **Attack path:** foundation §12 asks for maker-checker on rate and financial changes. The actions that actually cross the isolation boundary have none: registering a hostname against a tenant (HH-2 — the routing authority), changing a tenant's status, granting support access, and altering plan limits. One administrator with a stolen session or a grudge performs any of these unilaterally; MFA raises the bar on account takeover but does nothing against a legitimate operator.
- **Enforcing component:** an approval workflow in `apps/api/src/platform`.
- **Verification:** an E2E asserting `platform.tenant.hostname.register` and `platform.support.grant` remain pending until a second distinct platform user with the approver permission confirms, that the requester cannot self-approve, and that both actors appear in the audit row.
- **Correction:** ship the approval mechanism in Phase 1 wired to exactly those two actions; later phases inherit it for maker-checker on rate changes.

### PE-4 · MEDIUM–HIGH · Class 2 (missing design control) · Before S8 acceptance
**Default-deny is specified for tenancy but not for permissions.**

- **Trust boundary:** an authenticated tenant staff user → operations they hold no permission for.
- **Attack path:** §5.2 states every route is tenant-scoped unless marked `@PlatformRoute()` or `@PublicRoute()` — an excellent default for *tenancy*. There is no equivalent for *authorisation*. A route added without `@RequirePermission()` is reachable by any authenticated user of the tenant, and nothing fails. In Phase 1 the blast radius is small; by Phase 5 the route count is in the hundreds and the omission is invisible in review. This is the same decay the DMMF-driven coverage check was invented to prevent, applied to models but not to routes.
- **Enforcing component:** the permission guard in `packages/permissions` plus a route-registry test.
- **Verification:** a test enumerating the Nest route registry at runtime, failing on any route lacking an explicit `@RequirePermission(...)` or `@NoPermissionRequired('<justification>')` — the same runtime-enumeration technique already used for the DMMF, so Phase 2+ routes are covered automatically.
- **Correction:** add the rule and the test to §6.3, alongside the four-question authorisation order.

### PE-5 · MEDIUM · Class 2 (missing design control) · Before S9 acceptance
**Quota and metering tables are writable by the role that tenant requests run as.**

- **Trust boundary:** tenant runtime → the commercial limits that constrain it.
- **Attack path:** §4.1 declares `usage_counters` and `storage_ledger` tenant-scoped, so `excelex_app` holds full DML on them, restricted by RLS to the tenant's own rows — which is exactly the tenant whose quota they encode. Any ORM-level bug, raw-query path or logic error in a tenant-reachable path can reset a tenant's own usage counters or storage ledger, defeating every `hard` limit in §6.4 and the storage accounting foundation §8.5 requires. `audit_events` has `UPDATE`/`DELETE` revoked but `INSERT` granted, so a tenant-reachable path can also forge or flood the tenant's own audit trail.
- **Enforcing component:** the grant set emitted alongside the RLS policies.
- **Verification:** an integration test asserting `excelex_app` receives `permission denied` on `UPDATE`/`DELETE` against `usage_counters` and `storage_ledger`, and that a negative delta insert violates a `CHECK`.
- **Correction:** make both tables append-only delta ledgers — `INSERT` only, `UPDATE`/`DELETE` revoked, `CHECK (delta >= 0)`, current value computed as a `SUM` or maintained by a `SECURITY DEFINER` function.

---

## Surface 9 — Storage URL leakage

The key structure `tenants/<tenantId>/…` derived only from context, with magic-byte content validation, is correct; no finding against it.

### ST-1 · MEDIUM–HIGH · Class 2 (missing control) + 4 (residual) · Before S10 acceptance
**A pre-signed URL is a bearer credential that outlives every revocation mechanism the design relies on.**

- **Trust boundary:** an authorisation decision at time T → object access at T + TTL, with no re-check.
- **Attack path:** §8.3 says downloads are "pre-signed, short-lived, and authorised before the URL is issued" — TTL unstated. A pre-signed URL survives session revocation, staff deactivation, tenant suspension, support-access expiry (SA-2) and tenant offboarding (SA-3), because S3 validates only the signature and expiry. ADR-0003's headline claim — "revocation is immediate and total" — is therefore false for every document already linked. Concretely: a support engineer with a 60-minute session pre-signs 500 POD and invoice URLs in the last minute; the session expires; the URLs remain live for their full TTL with no audit of their use. Compounding it, §6.5 sets `Referrer-Policy` without stating a value: a pre-signed URL used as an `<img src>` or `<a href>` leaks in full via `Referer` to any third-party origin the page contacts.
- **Enforcing component:** `StorageService` in `apps/api/src/shared`.
- **Verification:** a test asserting the issued TTL is ≤ the configured maximum and ≤ the remaining lifetime of the issuing session or support session; an integration test that revokes a session and asserts a previously issued URL fails (proving the proxy path is used for sensitive documents); a header test asserting `Referrer-Policy: no-referrer` on any response containing a signed URL.
- **Correction:** default to proxying bytes through an authenticated API endpoint for tenant documents so authorisation is re-evaluated per request; reserve pre-signing for large objects with a hard TTL cap (≤120s), issued via a redirect from an authenticated endpoint so the URL never lands in page markup; cap every URL's expiry at the issuing session's expiry; log every issuance to the audit trail. Record the residual — a pre-signed URL, once emitted, cannot be recalled.

### ST-2 · MEDIUM · Class 2 (missing design control) · Before S12
**A single static bucket credential with no prefix-scoped policy is the storage analogue of a `BYPASSRLS` role.**

- **Trust boundary:** the application's storage principal → every tenant's object namespace.
- **Attack path:** one bucket, one credential. The tenant-prefix discipline is entirely application-side; the credential can read, write, list and delete any key. A path-construction bug, a traversal in `<sanitised-name>`, or any path that takes a key from input rather than context reads across tenants with no storage-side obstacle — the storage layer has no equivalent of RLS, so unlike the database this is a single-barrier design and the documents do not say so.
- **Enforcing component:** the bucket policy in `infrastructure/deployment/` plus `StorageService`.
- **Verification:** an operational check asserting the runtime principal is denied `s3:ListBucket` at the bucket root or restricted by a prefix condition, and an integration test asserting a `StorageService` call with a key outside the current context's prefix throws before any S3 call is issued.
- **Correction:** deny `ListBucket`, add a prefix-condition bucket policy, and add an assertion in `StorageService` that every resolved key begins with `tenants/<contextTenantId>/` — a five-line second barrier matching the database layer's two-barrier property.

### ST-3 · MEDIUM · Class 1 (design defect) · Before S10 acceptance
**Pre-signed uploads bypass the storage ledger, so the hard storage quota is unenforceable on the path that uploads bytes.**

- **Trust boundary:** the plan limit a tenant pays for → actual consumption.
- **Attack path:** §8.3 states "every write updates `storage_ledger`" and §6.4 blocks non-essential uploads at the hard limit. If uploads are pre-signed PUTs — the standard pattern for POD images and the one implied by pre-signed downloads and MinIO — the bytes go client-to-S3 and the API never observes the size. A tenant at 99% of a 100 GB limit requests a pre-signed PUT and uploads 500 GB; the ledger records nothing, the quota is not enforced, and ExcelEx pays for storage it did not sell.
- **Enforcing component:** `StorageService` plus a reconciliation job.
- **Verification:** an integration test issuing a pre-signed PUT against a nearly exhausted quota, uploading an oversized object, asserting (a) the signed policy's content-length range rejects it, and (b) a reconciliation job detects any discrepancy between the ledger and actual bucket usage and blocks further uploads.
- **Correction:** pin `content-length-range` in the pre-signed policy, require a client-side finalise call recording the byte count, and add periodic reconciliation of `storage_ledger` against bucket inventory — the ledger is the billing record and must be reconcilable, not merely written.

---

## Surface 10 — Support-access abuse

### SA-1 · HIGH · Class 2 (missing design control) · **BLOCKS S9**
**The platform's most commercially significant isolation decision has no approval record.**

- **Trust boundary:** ExcelEx staff → a tenant's shipment, customer and financial data.
- **Attack path:** this is not an exploit so much as an unmade decision that will be made by default. ADR-0003 §5 states that reaching tenant data requires "an explicit, reason-stamped, time-boxed support-access session recorded in `support_access_sessions` and surfaced to the tenant". *Surfaced* is notification, not consent. For a platform whose core promise is that competing courier companies cannot see each other's data, whether ExcelEx staff may read a tenant's shipment volumes, customer list and margins unilaterally — or only with that tenant's approval — is a contractual term, not an implementation detail. It appears nowhere in DEC-001 through DEC-011, so no one signs it, and the implementation will choose notify-only because that is easiest. When a tenant's counsel asks "can ExcelEx read our rate cards without telling us first", the answer will have been decided by an engineer at S9.
- **Enforcing component:** the support-access module in `apps/api/src/platform`; the decision itself belongs in `03-DECISIONS-REQUIRING-APPROVAL.md`.
- **Verification:** once decided, an E2E asserting the chosen model end to end — for approval-required, that a grant remains pending until a tenant administrator approves and no tenant data is readable in the interim; for notify-only, that a message reaches a tenant-owned channel at grant time, before the first data read, via the outbox.
- **Correction:** add **DEC-012 — support-access consent model** with three options (notify-only / tenant-approval-required / break-glass with post-hoc justification and mandatory disclosure), a recommendation, and a signature line. Blocking at S9 because S9 builds the mechanism.

### SA-2 · MEDIUM–HIGH · Class 2 (missing design control) · Before S9 acceptance
**Support-session scope, enforcement point, expiry semantics and notification integrity are all unspecified.**

- **Trust boundary:** a time-boxed, reason-stamped grant → the actual reach it confers.
- **Attack path:** `support_access_sessions` records who, which tenant, why, when, and what expired it. Missing: (a) **scope** — read-only or read-write? which permissions? one tenant or several? Unspecified defaults to full access, so an engineer investigating a label-printing bug can modify invoices; (b) **enforcement point** — the session must be checked on every data access, not at creation; if checked once and the resulting platform session carries the capability, expiry is cosmetic; (c) **caching** — if cached in Redis, expiry lags by the TTL (CA-1 applied to the most sensitive object in the system); (d) **notification integrity** — an in-app banner rendered by software ExcelEx controls can be suppressed by the same administrator the notice is about; (e) **linkage** — it is not connected to `$asPlatform` (PE-1), so two independent mechanisms both claim to gate tenant data access and neither references the other.
- **Enforcing component:** `$asTenant` in `packages/database` (per PE-1) plus the outbox for notification.
- **Verification:** an E2E asserting: a platform actor reading tenant data without an active session is denied at the service layer; every such read writes an audit row with a foreign key to the session; the tenant's administrators receive an email captured in Mailpit at grant time; access is denied one second after `expires_at` with no restart and no cache flush; and a read-only session is refused on any write.
- **Correction:** specify scope (default read-only, write requiring separate justification and a second approver per PE-3), a default duration (60 minutes), per-access enforcement through `$asTenant`, notification via the outbox to a tenant-owned channel at grant time, and TOTP step-up at grant.

### SA-3 · MEDIUM · Class 2 (missing control) + 4 (residual) · Before S13
**Tenant offboarding deletes tenant data and storage objects, and nothing else.**

- **Trust boundary:** a closed tenant's data → continued existence and reachability.
- **Attack path:** §10.3 defines closure as export availability, grace period, then "deletion of tenant data and storage objects". Not covered, and each is a live copy of tenant data after the platform tells the customer their data is gone: Redis cache entries under `t:<tenantId>:`; the hostname cache entry (CA-1, which has no TTL, so it can outlive the tenant indefinitely); active sessions and their Redis entries; queued, delayed, repeatable and dead-lettered BullMQ jobs carrying payloads; `idempotency_keys` response snapshots, which by design store *response bodies* containing tenant data; undrained `outbox_events`; already-issued pre-signed URLs (ST-1); and the hostname itself (HH-6). Backups and the PITR WAL archive are the honest residual.
- **Enforcing component:** the offboarding job in `apps/api/src/platform`.
- **Verification:** an integration test that closes a seeded tenant and asserts zero remaining keys matching `t:<tenantId>:*` and `host:<its hostnames>` in Redis, zero jobs in every queue with that `tenantId`, zero `idempotency_keys` and `outbox_events` rows, and zero live sessions.
- **Correction:** enumerate the full deletion surface in §10.3, and state the backup/PITR residual explicitly with its retention horizon so it can be disclosed contractually rather than discovered during a deletion request.

---

## What the design does not defend against at all (classification 4)

Stated plainly, because a threat model that implies otherwise is worse than none.

1. **A malicious or compromised ExcelEx platform administrator, or anyone with deploy access.** Mandatory MFA and audit logging raise the cost and improve detection; they do not prevent it. Whoever can land a migration can grant `BYPASSRLS`, alter a policy, read every tenant, and rewrite the audit trail that would have shown it (PE-2). PE-3's second-approver rule and PE-2's hash chain move this from "invisible" to "detectable", which is the honest ceiling for a single-database platform.

2. **PostgreSQL superuser, the managed-database operator, and the cloud provider.** `FORCE ROW LEVEL SECURITY` explicitly does not constrain superusers — ADR-0002 says so correctly. Every tenant's data is readable by the hosting provider's staff. A procurement and contract question (DEC-010), not an engineering one.

3. **Backups and point-in-time recovery are cross-tenant by construction.** A restore restores everybody. A tenant's deletion request cannot reach the WAL archive within the retention window without destroying recoverability for all other tenants. Disclose the horizon; do not promise erasure inside it.

4. **Supply-chain compromise of any dependency in the API process.** A malicious transitive package runs inside `AsyncLocalStorage`, holds the Prisma client, `DATABASE_URL`, `SESSION_SECRET` and Redis. Both barriers are inside the blast radius. Lockfile pinning, `gitleaks` and Trivy reduce the odds; nothing in this architecture contains it.

5. **A tenant's own compromised staff account or stolen session on its own host.** Isolation is between tenants, not within one. The `__Host-` cookie, RLS and the extension all faithfully serve an attacker holding a valid tenant-A session as tenant A.

6. **Resource contention between tenants.** Shared connection pool, Redis, worker concurrency and CPU. PL-2's bulkheads bound it; a single database cannot eliminate it. If a tenant contracts for availability isolation, that is a database-per-tenant conversation.

7. **Browser-level side channels between same-site origins.** Every tenant subdomain shares the registrable domain. A stored XSS in one tenant's page cannot read another tenant's `__Host-` cookie, but same-site request forgery (mitigated only by the §6.5 origin check), cookie-jar and `Cookie`-header-size exhaustion, and cross-site-leak timing techniques all remain available and are not eliminable while tenants share a site.

8. **The existence of the tenant list, absent HH-8's wildcard certificate.** DNS and Certificate Transparency are public. HH-4 and HH-8 reduce the leak to what DNS already implies; they do not make the customer list private.

---

## Summary table

| ID | Surface | Severity | Class | Blocking |
| --- | --- | --- | --- | --- |
| CT-1 | Cross-tenant escape | Critical | 1 | **BLOCKS S5** |
| CT-2 | Cross-tenant escape | High | 1 | **BLOCKS S5, S10** |
| CT-3 | Cross-tenant escape | High | 1 | **BLOCKS S5** |
| CT-4 | Cross-tenant escape | High | 2 | **BLOCKS S5** |
| CT-5 | Cross-tenant escape | High | 2 | **BLOCKS S6** |
| CT-6 | Cross-tenant escape | Medium | 3 | Before Phase 1 acceptance |
| HH-1 | Host header | High | 1 | **BLOCKS S2, S6** |
| HH-2 | Host header | High | 1 | **BLOCKS S5** |
| HH-3 | Host header | High | 2 | Before S7 acceptance |
| HH-4 | Host header | Medium | 1 | Before Phase 1 acceptance |
| HH-5 | Host header | Medium | 2 | Before S4/S6 acceptance |
| HH-6 | Host header | Medium | 2 | Before Phase 1 acceptance |
| HH-7 | Host header | Med–High | 2 | Before S4 acceptance |
| HH-8 | Host header | Low–Med | 2 | Before S12 |
| CA-1 | Redis / cache | High | 1 | **BLOCKS S6** |
| CA-2 | Redis / cache | Medium | 2 | Before S7 acceptance |
| CA-3 | Redis / cache | Medium | 2 | Before S12 |
| CA-4 | Redis / cache | High | 2 | **BLOCKS S4 acceptance** |
| RLS-1 | RLS bypass | High | 2 | **BLOCKS criterion 10** |
| RLS-2 | RLS bypass | Med–High | 1 | Before S5 acceptance |
| RLS-3 | RLS bypass | Medium | 2 | Before S5 acceptance |
| RLS-4 | RLS bypass | High | 2 | **BLOCKS S11** |
| PL-1 | Pooling / context | High | 2 | **BLOCKS S6** |
| PL-2 | Pooling / context | Medium | 4 | Before S5 acceptance |
| PL-3 | Pooling / context | High | 1 | **BLOCKS S9** |
| SC-1 | Session / cookie | Medium | 1 | Before S3 acceptance |
| SC-2 | Session / cookie | Medium | 2 | Before S7 acceptance |
| SC-3 | Session / cookie | Med–High | 2 | Before S7 acceptance |
| SC-4 | Session / cookie | High | 2 | Before S7 acceptance |
| SC-5 | Session / cookie | Medium | 2 | Before S7 acceptance |
| SC-6 | Session / cookie | Med–High | 2 | Before S7 acceptance |
| SC-7 | Session / cookie | Medium | 2 | Before S7 acceptance |
| Q-1 | Queue tampering | High | 1 | **BLOCKS S10** |
| Q-2 | Queue tampering | Med–High | 1 | **BLOCKS S10** |
| Q-3 | Queue tampering | Med–High | 2 | Before S10 acceptance |
| PE-1 | Platform escalation | High | 1 | **BLOCKS S6** |
| PE-2 | Platform escalation | Medium | 1 + 4 | Before S13 |
| PE-3 | Platform escalation | Medium | 2 | Before S9 acceptance |
| PE-4 | Platform escalation | Med–High | 2 | Before S8 acceptance |
| PE-5 | Platform escalation | Medium | 2 | Before S9 acceptance |
| ST-1 | Storage URLs | Med–High | 2 + 4 | Before S10 acceptance |
| ST-2 | Storage URLs | Medium | 2 | Before S12 |
| ST-3 | Storage URLs | Medium | 1 | Before S10 acceptance |
| SA-1 | Support access | High | 2 | **BLOCKS S9** |
| SA-2 | Support access | Med–High | 2 | Before S9 acceptance |
| SA-3 | Support access | Medium | 2 + 4 | Before S13 |

**Totals:** 1 critical, 15 high, 8 medium–high, 20 medium, 1 low–medium. Twelve items block a step; the remainder close before Phase 1 acceptance.

**By classification:** 14 design defects, 28 missing design controls, 1 implementation verification requirement, 2 pure residuals (plus 3 findings with a residual component).

---

## Ranked list — what must be fixed in the planning documents before any code is written

Ordered by the cost of discovering it later. Items 1–9 are edits to ADR-0001, ADR-0002, ADR-0003 and the implementation plan; item 10 is a new decision record. **None require code.**

1. **CT-1 — replace column-inference classification with a declared model scope.** The single highest-value edit: as written, the generator hands the tenant runtime role write access to the hostname routing table and the subscription table, and the check that exists to catch exactly this reports success. Everything downstream of the routing table (HH-2, CA-1) inherits the problem.
2. **HH-1 — rewrite the trusted-host mechanism in ADR-0001 §4.** Delete the hop-count language, specify unconditional `proxy_set_header X-Forwarded-Host $host;`, enumerate the stripped headers, and expand criterion 4 into a fixture table executed through the Nginx container. The Nginx config is written at S2, so this must land before S2.
3. **CT-2 — decide the cross-tenant read path and write it into ADR-0002.** Without this, the outbox poller, retention purge, usage aggregation and session sweep have no legal data path and the implementer will reach for `BYPASSRLS`, which silently deletes Barrier 2 for every background job in the platform's history.
4. **PE-1 + SA-1 + SA-2 — split the escape hatch and record the support-access consent model.** One edit, because the mechanism and the policy are the same control and today neither references the other.
5. **CT-3 + RLS-2 — pin the exact context-setting statement and strengthen the codebase assertion.** The plan calls the current version its highest-value test; it is currently satisfied by the attack it is meant to prevent.
6. **RLS-4 + RLS-1 — redefine the cross-tenant suite to prove barrier independence, and make the coverage check read the live database.** Without these, the design's central claim is untested and the platform can ship with one barrier while believing it has two.
7. **CT-5 + PL-1 — add an in-process-cache and context-confusion section to ADR-0002.** The only isolation gap in the design with *no* barrier behind it, and the most likely way this platform actually leaks in Phase 2 or 3.
8. **Q-1 + Q-2 — fix the queue trust model.** Q-2 in particular will otherwise produce silent, business-visible cross-tenant job loss the first time two tenants share an invoice or AWB number format.
9. **CA-1 + CA-4 — bound the hostname cache and address Next.js caching.** The plan currently says nothing about Next.js caching, whose defaults are precisely the cross-tenant leak.
10. **PL-3 + SC-4 — two topology decisions nearly free now and structural later.** A third entrypoint so `DATABASE_PLATFORM_URL` never exists in the process serving tenant hosts; and a distinct cookie name, session table and `actor.kind` guard for the customer portal.

Two lower-cost edits worth making in the same pass: renumber ADR-0003's decision points, which currently run 1, 2, 3, 4, **9**, 5, 6, 7, 8 — an implementer working through "points 1–5" skips the CSRF origin check, which §6.1 itself calls load-bearing; and reconcile `DATABASE_TRANSACTION_TIMEOUT_MS=15000` with the five-second discussion in §5.3, because the difference is a threefold change in pool-exhaustion exposure presented as a formatting detail.

---

## Verdict

The isolation architecture is sound and should not be redesigned. Two independent barriers, a non-owner runtime role with `FORCE`, host-only session cookies with the reasoning stated correctly, DMMF-driven coverage, and an audit history that records its own previous errors — this is a better-than-typical Phase 1 package, and the corrections above are edits to specification text, not a change of direction.

What the package currently lacks is symmetry between the care taken at the database layer and the care taken everywhere the database is not: the queue trusts Redis, the caches have no tenant discipline outside Redis, the classification rule that drives the whole generator is an inference rather than a declaration, and the cross-tenant reads Phase 1 itself performs have no legal path. The strongest single recommendation is to spend one more revision closing items 1–9 before S0 signs off, because each is currently a paragraph and after S5 each is a migration.

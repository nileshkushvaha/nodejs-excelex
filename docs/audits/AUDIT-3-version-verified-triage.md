# Audit 3 — Version-Verified Triage of Threat-Model Findings

**Type:** Read-only evidence validation. Supersedes the severity and blocking classifications in AUDIT-2 where they conflict.
**Date:** 16 August 2026
**Verified against:** Prisma 7.9.x, Next.js 16.3.x, PostgreSQL 18 — the versions pinned in `01-VERSION-MATRIX.md`
**Purpose:** Several AUDIT-2 findings rest on framework behaviour that is no longer current. Implementing them as written would make the system worse. This document records what survived verification, what did not, and what the verification itself uncovered.

---

## 1. Rejected — outdated framework claims

These findings described real problems in older versions. Against the pinned versions they are false. **Do not implement their corrections.**

### CT-6 — REJECTED. Prisma unique operations accept extra non-unique conditions.

AUDIT-2 claimed `findUnique` cannot carry a `tenantId` filter, so the extension must rewrite `findUnique` → `findFirst` and `update`/`delete` → `updateMany`/`deleteMany`.

`extendedWhereUnique` reached **General Availability in Prisma 5.0** and is not behind a flag in 7.x. All of these are valid:

```ts
prisma.user.findUnique({ where: { id, tenantId } })
prisma.user.update({ where: { id, tenantId }, data })
prisma.user.delete({ where: { id, tenantId } })
```

At least one unique field must be present at the top level; any number of additional non-unique scalars may accompany it, and they are ANDed into the SQL `WHERE`. A tenant mismatch yields `null` from `findUnique` and **P2025** from `update`/`delete`.

The proposed rewrite would actively harm the codebase: `updateMany`/`deleteMany` return `{ count }` rather than the record, do not support `select`/`include`, do not support nested writes, and silently return `count: 0` instead of raising P2025 — so every call site would have to hand-roll its own not-found handling. `findFirst` also loses the findUnique dataloader batching, turning coalesced reads into N+1.

**Correct approach:** keep the singular operations and inject `tenantId` into `where`.

### CA-4 — REJECTED as stated; a narrower real finding replaces it.

AUDIT-2 claimed Next.js memoizes `fetch` by URL and options by default, so tenant A's data could be served to tenant B. That was Next.js 14 behaviour.

In Next.js 16.3 the default is **`auto no cache`** — nothing enters the Data Cache without an explicit `cache: 'force-cache'` or `next: { revalidate }`. Independently, reading `cookies()` or `headers()` **automatically** opts a route into dynamic rendering, excluding it from the Full Route Cache and emitting `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`. An authenticated route whose API client forwards a session cookie is therefore dynamic by construction.

Two of the proposed corrections are wrong and one is harmful:

- **`export const dynamic = 'force-dynamic'` — reject.** Redundant given cookie access, and the `dynamic` segment config is **removed entirely** when `cacheComponents` is enabled (Next.js 16.0). Hard-coding it is migration debt.
- **`Vary: Cookie, Host` — reject as harmful.** Next.js already sets its own `Vary` containing the RSC discriminators (`rsc`, `next-router-state-tree`, `next-router-prefetch`, `next-url`). An Nginx `proxy_hide_header Vary` + `add_header Vary "Cookie, Host"` destroys those, letting a shared cache serve cached HTML to an RSC request. Applying `Vary: Cookie` broadly also collapses the hit rate on `/_next/static/*`.
- **`cache: 'no-store'` on the authenticated API client — keep.** Redundant against current defaults, but it is a cheap guarantee that survives a refactor removing the cookie read.

**The real findings that replace CA-4:**

1. An authenticated route whose page code never touches `cookies()`/`headers()` — because auth is enforced only in `proxy.ts` — **is prerendered at build and shared across all tenants**. Next.js's own authentication guide flags exactly this. The control is a build-time assertion that no route under `(tenant)`, `(platform)` or `(portal)` is statically rendered.
2. If Nginx `proxy_cache` is ever enabled, its default key is `$scheme$proxy_host$request_uri`, where `$proxy_host` is the **upstream name, not the client Host** — so tenant hostnames sharing an upstream collide. Fix the cache key (`$scheme$host$request_uri`), do not reach for `Vary`.
3. An explicit written authenticated-caching policy is still required, because `force-cache` will cache a cookie-bearing request if someone sets it.

### Plan §9 / ADR-0002 "Prisma does not nest `$transaction`" — OUTDATED.

**Prisma 7.5.0 added nested transactions via savepoints**, explicitly enabling `$transaction` from an interactive transaction client. The stated rationale for the test-isolation rule is therefore wrong for the pinned version.

The *conclusion* may still be right — a rollback-wrapped test still risks isolating nothing if the inner work runs on a savepoint that commits with the outer — but the documents must not justify it with a limitation that no longer exists. Re-derive the rule, or adopt truncation for the simpler reason that it matches production behaviour.

### "Prisma requires `pgbouncer=true`" — OUTDATED.

Prisma's current guidance is to **not** set it for PgBouncer ≥ 1.21.0, which supports protocol-level prepared statements in transaction mode. Only set it below that version. Separately, Prisma 7 makes driver adapters mandatory, so pool sizing comes from the `pg` driver rather than Prisma URL parameters — which changes how PL-2 (pool exhaustion) must be configured and measured.

### `MATCH FULL` — CONFIRMED WRONG (from AUDIT-1 A2).

`MATCH FULL` requires referencing columns to be all-NULL or all-non-NULL. With `tenant_id NOT NULL` mandated, an optional `branch_id` becomes unrepresentable. **`MATCH SIMPLE` was already correct.** Revert in plan §4.2, ADR-0002 Layer 5 and matrix §7.

### "UNIQUE constraint, not merely a unique index" — WRONG, and it named the wrong trap.

PostgreSQL accepts a non-partial, non-expression unique **index** as an FK target; Prisma's `@@unique` emits an index and that is fine. The real trap is that **partial unique indexes cannot back a foreign key** — which collides with plan §2.3's soft-delete convention. An unconditional `UNIQUE (tenant_id, id)` must exist alongside the partial indexes.

---

## 2. New findings the verification uncovered

Neither audit caught these, and one is more serious than the finding it was found while checking.

### NEW-1 · HIGH · Prisma client extensions do not intercept nested reads or writes.

Documented limitation, tracking issue prisma/prisma#24525 still open: *"The `query` extension type does not support nested read and write operations."*

So `prisma.organisation.update({ data: { users: { update: {...} } } })` **never runs the `user` extension** — Barrier 1 is absent for every nested write. RLS still covers it, but the design's central claim is two independent barriers, and for nested operations there is one.

**Correction:** forbid nested cross-model writes by lint in tenant-scoped code, requiring explicit sequential operations inside the tenant transaction; add a cross-tenant test that performs a nested write targeting another tenant and asserts denial with the extension active and RLS dropped.

### NEW-2 · HIGH · `upsert`'s create branch bypasses tenant scoping.

Injecting `tenantId` into `where` does not stop the `create` branch. A tenant mismatch turns an intended update into a **cross-tenant insert**, which then typically surfaces as a confusing P2002 unique violation rather than an authorization error.

**Correction:** the extension must inject `tenantId` into both `where` and `create` for `upsert`, and a test must cover it.

### NEW-3 · MEDIUM · Next.js 16 deprecates `middleware.ts` in favour of `proxy.ts`.

Plan §7.1 specifies "middleware". In Next.js 16 the file is `proxy.ts`, runs on the Node runtime, and executes on every request including static assets unless a matcher excludes them.

This *reinforces* HH-7 rather than contradicting it: Next.js's own documentation states proxy "should not be used as a full session management or authorization solution" and "should not be your only line of defense". Presentation routing only, with all authorization re-derived server-side.

### NEW-4 · MEDIUM · Pin Next.js ≥ 16.3.0 for security reasons, not just currency.

CVE-2025-29927 (the `x-middleware-subrequest` bypass) does not affect 16.x, but 16.x has its own proxy-bypass chain — CVE-2026-44575 and CVE-2026-45109 (patched 16.2.6) and CVE-2026-64642 (patched 16.2.11) — plus two fetch cache-confusion CVEs, CVE-2026-64648 and CVE-2026-64647. All are included in **16.3.0**. Stripping `x-middleware-subrequest` at the proxy remains correct defence in depth.

### NEW-5 · LOW · Transaction defaults are `maxWait: 2000ms` and `timeout: 5000ms`.

The setup guide sets only a timeout (`DATABASE_TRANSACTION_TIMEOUT_MS=15000`). Under the RLS design every request opens a transaction, so `maxWait` governs behaviour under pool pressure and must be set explicitly too.

---

## 3. Confirmed — evidence located in the current revision

Each verified by direct citation. These are real and must be fixed before or during the milestone named.

| ID | Evidence in current revision | Verdict | Fix at |
| --- | --- | --- | --- |
| CT-1 | ADR-0002 L79 and plan L208 both classify by "models carrying `tenant_id`"; plan §4.1 lists `tenant_hostnames` as platform-scoped; setup §2.2 revoke omits it | Confirmed design defect | Before code |
| CT-2 | No role or policy grants any cross-tenant read; outbox poller (§8.2) and retention job (§10.3) require one | Confirmed design defect | Before code |
| CT-3 | `SET LOCAL` mandated in ADR-0002 L?? and plan §5.3; `SET` cannot take a bind parameter | Confirmed design defect | Before code |
| CT-4 | Plan L186, L246; ADR-0002 L75 — accessors named, no `search_path`, no `EXECUTE` revoke, no signatures | Confirmed missing control | Before code |
| CT-5 / PL-1 | No mention of in-process caching or ALS context confusion anywhere | Confirmed missing control | Milestone D |
| HH-1 | `TRUSTED_PROXY_HOPS=1` at setup L208; "hop count" at ADR-0001 L38, plan L118 and L408 | Confirmed design defect — `X-Forwarded-Host` has no hop semantics | Before code (Nginx written at B) |
| HH-2 | Reserved-list constraint specified on `tenants.slug`; ADR-0001 §1 makes `tenant_hostnames` the routing authority | Confirmed design defect | Milestone C |
| Q-1 / Q-2 | Plan L350: `jobId` "derived from the business key", no tenant prefix; worker re-seals from payload | Confirmed design defect | Milestone G |
| PE-1 | Plan L251 and ADR-0002 L47: `$asPlatform` enforced by "ESLint import-boundary rule" | Confirmed design defect — already overridden by the implementation authorization, which forbids a broad bypass | Milestone F |
| RLS-1 / RLS-4 | Coverage check asserts over generated migration text; suite never runs with one barrier disabled | Confirmed missing control | Milestone C |
| HH-4, HH-5, HH-6, SC-1..SC-7, PE-3..PE-5, ST-1..ST-3, CA-1..CA-3, RLS-2, RLS-3 | All located in current text | Confirmed, various | Their milestone |

**SA-1 is resolved, not deferred.** The implementation authorization supplies the support-access policy directly: read-only default, explicit reason, short expiry, step-up authentication, complete auditing, tenant notification, stronger approval for write, consent model kept configurable. That is a business decision made by the owner, and it closes the finding.

---

## 4. Architecture expansion — judged against the baseline

AUDIT-2 proposed infrastructure that would expand Phase 1 well past its scope. Verdicts:

| Proposal | Verdict |
| --- | --- |
| Third platform API process | **Not required before first code.** The requirement — platform and tenant routes cannot resolve each other's privileged client — is met by DI module separation plus a runtime boot assertion. Revisit as a deployment topology choice at Milestone I. |
| Dedicated `excelex_jobs` role | **Required at Milestone C.** Minimal and enumerable: one role, additive policies on three named tables. Justified because the alternative an implementer will otherwise reach for is `BYPASSRLS`. |
| Hash-chained audit log | **Future hardening.** The authorization requires honest wording, not tamper-evidence. Revoke correctly, describe accurately, defer the chain. |
| External append-only audit storage | **Future hardening.** Depends on cloud resources Phase 1 is forbidden from creating. |
| Maker-checker workflows | **Future hardening.** Baseline §12 scopes it to rate and financial changes, which are Phase 4. |
| Per-tenant transaction semaphore | **Not justified without measurement.** Add the S5 pool-saturation benchmark; add the semaphore only if it fires. |
| Tenant-aware memoization primitive | **Required at Milestone D.** This is the one isolation gap with no barrier behind it. |
| Redis ACL separation | **Required before Phase 1 acceptance**, as a boot assertion on credentials and TLS. Not before first code. |
| Materialized-view prohibition | **Required at Milestone C** — a cheap rule in the same generator, free while nothing exists to break. |
| Proxying all file downloads | **Defer.** Phase 1 has no documents. Write the policy at Milestone G, implement at Phase 3/4. |

---

## 5. Documents requiring correction before code

1. **ADR-0002** — classification by declared model scope not column inference; `set_config` parameterised form; nested-write and `upsert` limitations; `MATCH SIMPLE`; unique-index correction; remove the nesting rationale; four roles and three connection strings; in-process cache rule.
2. **ADR-0001** — delete the hop-count mechanism, specify unconditional header overwrite and the stripped-header list; move the reserved-name constraint to `tenant_hostnames`; local hostname table to HTTPS; hostname retirement.
3. **ADR-0003** — renumber decision points; delete the plain-HTTP fallback branch; portal audience separation; session rotation on authentication.
4. **Implementation plan** — §4.2, §4.3, §5.1, §5.3, §7.1, §8.1, §9, §11 criterion 10, §10 subsection numbering.
5. **Version matrix** — Next.js ≥ 16.3.0 with the CVE rationale; add missing pins; correct §7 risks.
6. **Setup guide** — `TRUSTED_PROXY_HOPS` removal; revoke list; `maxWait`; task-name reconciliation.
7. **Decisions document** — DEC-008 needs a real option set; DEC-002/004/009 reclassification; DEC-007 reframed as cost acknowledgement.

All three ADRs revert to **Proposed** until explicitly approved.

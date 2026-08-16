# Audit 1 — Phase 1 Revision 2 Consistency Audit

**Type:** Read-only conformance audit
**Target:** Revision 2 of the Phase 1 planning documents
**Baseline:** `ExcelEx-NodeJS-SaaS-Project-Foundation.md`
**Date:** 16 August 2026
**Auditor context:** Isolated agent context with no visibility of the security threat model audit
**Files changed by this audit:** none

**Scope.** Whether revision 2 actually fixed revision 1's findings, covers every baseline requirement, has testable acceptance criteria, contains valid versions and cross-references, makes technically correct PostgreSQL / cookie / Prisma claims, and presents complete architectural decisions.

---

## A. Blockers

### A1 — `tenant_hostnames` is excluded from the platform REVOKE list, and is classified two contradictory ways

*Files:* setup guide §2.2 (revoke block), plan §4.1/§4.2/§11 criterion 10, ADR-0001 §Decision 1.

Plan §4.1 lists 13 platform-scoped tables. The generated revoke in setup guide §2.2 names 12 — `tenant_hostnames` is missing. Combined with the blanket `ALTER DEFAULT PRIVILEGES ... GRANT SELECT, INSERT, UPDATE, DELETE ... TO excelex_app` immediately above it, every tenant request retains **full DML on the hostname→tenant mapping**: enumerate all tenants' hostnames, or `UPDATE tenant_hostnames SET tenant_id = <mine>` and take over another tenant's host. This defeats ADR-0001, the trust chain in §5.1, and criterion 7.

Compounding it: ADR-0001 gives `tenant_hostnames` a `tenant_id` column, so criterion 10's rule ("every model carrying `tenant_id` has a policy") classifies it as a *tenant* table needing RLS, while §4.1 classifies it as a *platform* table needing a revoke. The coverage check cannot pass both halves as specified, and whichever half is implemented, the other silently does not apply.

**Fix.** Add `tenant_hostnames` to the revoke list. State explicitly that the coverage check classifies by the §4.1 table list, not by presence of a `tenant_id` column, and that `tenant_hostnames` is platform-scoped-with-a-tenant-FK. Add a criterion 7 assertion that `excelex_app` receives `permission denied` on `tenant_hostnames` for SELECT and UPDATE.

### A2 — `MATCH FULL` makes optional tenant-scoped relations impossible; the revision 2 fix is technically wrong

*Files:* plan §4.2, ADR-0002 Layer 5, version matrix §7, plan §16 row 8.

Claim under audit: "nullable relations need `MATCH FULL`, because the default `MATCH SIMPLE` skips verification entirely when any referencing column is NULL — an optional `branch_id` would otherwise go unchecked."

`MATCH FULL` requires the referencing columns to be **either all NULL or all non-NULL**. §4.2 also mandates `tenant_id uuid NOT NULL` on every tenant table. Therefore `(tenant_id, branch_id) REFERENCES branches(tenant_id, id) MATCH FULL` makes `branch_id IS NULL` a **constraint violation** — an optional branch becomes unrepresentable, and every insert without a branch fails.

The risk it claims to close does not exist. With `tenant_id NOT NULL`, the only way `MATCH SIMPLE` skips the check is `branch_id IS NULL`, which correctly means "no reference." When `branch_id` is non-null, `tenant_id` is non-null too, so the check runs and the cross-tenant reference is caught.

**Correct position.** Keep the default `MATCH SIMPLE`. `MATCH FULL` is appropriate only when *all* referencing columns are nullable together, which this schema never has. Delete the claim from plan §4.2, ADR-0002 Layer 5 and matrix §7. Change the S5 proof to assert that an optional `branch_id = NULL` row inserts successfully while a cross-tenant non-null `branch_id` is rejected.

### A3 — Platform and support access to tenant data under RLS is undefined; `$asPlatform` cannot execute as specified

*Files:* plan §5.2, §4.2, §3.1 role table; ADR-0002 Layer 2/3b; setup guide §2.2.

Three consequences of revision 2's platform/tenant role split were not followed through:

1. `excelex_platform` is "under RLS: Yes" on tenant tables, but the only policy is `tenant_id = current_setting('app.tenant_id')`. A platform admin or support-access session therefore sees **zero tenant rows, always**. Nothing grants it a policy, and DEC-007 / §3.1 forbid `BYPASSRLS` on runtime roles. `support_access_sessions` (baseline §8.3) has no working read path.
2. `$asPlatform` is described as an extension on the tenant Prisma client — which runs as `excelex_app`, from which every platform table is revoked. It cannot read platform tables and cannot write its own `platform_audit_events` row. The two-connection model (`DATABASE_URL` / `DATABASE_PLATFORM_URL`) is never reconciled with it.
3. §5.1 says a client-supplied `tenantId` "writes a security audit event." On a rejected or unknown host there is no tenant, so `audit_events` (tenant-scoped, RLS) is unwritable, and `platform_audit_events` is revoked from `excelex_app`. **Security audit events on the pre-tenant path have nowhere to go.**

**Fix.** Specify a second RLS policy on tenant tables `TO excelex_platform USING (true)` gated by a support-access GUC, or an explicit support-access GUC in the existing policy. State that `$asPlatform` switches to the `excelex_platform` connection. Add a third append-only table (e.g. `security_events`, platform-scoped, INSERT-only grant to `excelex_app`) for pre-tenant rejections. Add an S9 proof that a support-access session reads exactly one tenant's rows and nothing else.

### A4 — `SECURITY DEFINER` accessors are specified with none of the properties that make them safe

*Files:* plan §4.2/§5.2, ADR-0002 Layer 3b.

The approach is sound in principle — the function runs as `excelex_owner`, platform tables have no RLS, so the narrow reads work and the caller never gets table privileges. As written it is a privilege-escalation vector, because the plan omits every required control:

- **No `SET search_path` pinning.** A `SECURITY DEFINER` function without `SET search_path = pg_catalog, pg_temp` (or fully-qualified references) can be hijacked via a `pg_temp` shadow of an unqualified table or operator, executing attacker code as the owner. This is the most-documented `SECURITY DEFINER` mistake and it is absent from all three documents.
- **No `REVOKE EXECUTE ... FROM PUBLIC`.** Functions are executable by `PUBLIC` by default, so `excelex_readonly` and any future role get them for free.
- **No argument scoping.** `get_tenant_status(tenant_id)` / `get_plan_limits(tenant_id)` taking a caller-supplied id lets any tenant enumerate every other tenant's status and plan. They should read `current_setting('app.tenant_id')` internally, except the hostname resolver, which necessarily takes a hostname — state that this is accepted and rate-limited.
- Functions should be `STABLE`, owned by `excelex_owner` (never a superuser), and return only the enumerated columns.

**Fix.** Add these four properties to §4.2 and ADR-0002 Layer 3b. Extend the criterion 10 coverage check to assert every `SECURITY DEFINER` function has `proconfig` containing `search_path` and no `EXECUTE` grant to `PUBLIC`.

---

## B. Regression check — plan §16 audit-history rows

19 of 20 rows verified. Findings:

| §16 row | Verdict |
| --- | --- |
| Platform auth tables | **Applied** (§4.1, ADR-0003 pt 5, revoke list) |
| `REVOKE ALL` / `excelex_platform` / `SECURITY DEFINER` | **Partial** — see A1, A3, A4. Also **ADR-0002 Layer 3 still says "Three database roles"** and lists only owner/app/readonly, omitting `excelex_platform`, and says "**Two** connection strings" where the setup guide defines three. The fix landed in the plan and setup guide but not in the ADR the plan cites as the record. |
| CD / containers / staging / migration job | Applied in content, **broken references** — see B1 |
| Backups / restore / DR | Same |
| same-site / `SameSite` correction | **Applied and correct** in §6.1, ADR-0003 pt 4, DEC-005 |
| `WITH CHECK` rationale | **Applied and correct** |
| `nullif(...)` | **Applied and correct** |
| Composite FK caveats | **Applied but wrong** — see A2 and B4 |
| Test isolation | **Applied and correct** (§9, ADR-0002, setup §8) |
| Nine vs eleven criteria | **Applied** — "eleven" is consistent in plan §0/§2.3/§11, setup §7, README |
| `format:check` + task-name reconciliation | **Partial** — see B2 |
| Criterion 9 self-reference | **Partial** — see B2 |
| Job monitoring | Applied (§8.1) |
| §6.5 / §8.4 | Applied |
| Retention / purge / offboarding | Applied in content, reference broken (B1) |
| KMS deferral | Applied (§7.3) — but see E |
| Three enforcement modes | Applied (§6.4, S9) |
| DEC-008/009/010 reclassification | Applied (§13, DEC headers, sign-off table) |
| Baseline §11 = 15 bullets | **Correct** — verified, 15 |
| "Dangling cross-references … corrected across all documents" | **False** — B1, B3, B4, F1, F2 |

### B1 — should-fix — renumbering left §10's subsections at 9.x

`## 10. Deployment, backup and data lifecycle` contains `### 9.1`, `### 9.2`, `### 9.3`. §16 rows point at "§10.1", "§10.2", "§10.3", which do not exist. Renumber the three subsections to 10.1–10.3.

### B2 — should-fix — turbo tasks and root scripts still do not match, and criterion 9 requires checks that exist nowhere

- Plan §2.2 claims pipeline tasks match the setup guide's root scripts "exactly". They do not. Setup §1 defines `check:rls` → `turbo run check:rls-coverage` (names differ); `format`, `verify`, `db:migrate`, `db:seed`, `infra:up/down/reset` have no turbo task; `format:check` is a **root-level `prettier --check .`**, not a delegated turbo task — yet criterion 1 and setup §7 row 1 both run `pnpm turbo run format:check ...`, which will find no such task in any package.
- Criterion 9's required-check list includes **`docker:build`**, defined in no `turbo.json` task list, no root script, and no S-step.
- Setup §7 row 2 invokes `pnpm --filter @excelex/testing smoke:infra`; `smoke:infra` is defined nowhere.
- §2.3 says "All **eleven checks** in §11 are required for merge" — §11 has eleven *criteria*, and criterion 9 separately lists eleven *CI check names*. The coincidence hides the fact that branch-protection status-check names are never defined (criteria 2, 3, 5, 6 are not check names).

**Fix.** Add `format:check` and `docker:build` as real turbo tasks, rename `check:rls` → `check:rls-coverage`, define `smoke:infra` in `packages/testing`, and add a table mapping criterion → required CI status-check name.

### B3 — should-fix — version matrix line 5 cites the wrong section

"the procedure in §4" — the procedure is §5; §4 is the testing/CI table. Cited correctly in three other places in the same file.

### B4 — should-fix — "UNIQUE constraint, not merely a unique index" is wrong, and it names the wrong trap

PostgreSQL accepts a plain non-partial, non-expression **unique index** as a foreign-key target. ADR-0002's parenthetical "Prisma's `@@unique` emits one [a UNIQUE constraint]" is also factually wrong — Prisma Migrate emits `CREATE UNIQUE INDEX ..._key`, and that is fine.

The real trap goes unmentioned and the plan walks straight into it: **partial unique indexes cannot back a foreign key**, and §2.3 mandates "`deleted_at timestamptz` plus **partial unique indexes**" as the deletion convention. A `(tenant_id, id) WHERE deleted_at IS NULL` unique index is not a valid FK target.

**Fix.** Replace the claim with "referenced columns need a non-partial, non-expression unique index or constraint; the partial unique indexes used for soft deletes cannot serve as FK targets — keep an unconditional `UNIQUE (tenant_id, id)` alongside them," and make that the S5 proof.

---

## C. Coverage — baseline §11 "Phase 1", exactly **15** bullets

| # | Baseline bullet | Covered at | Note |
| --- | --- | --- | --- |
| 1 | Monorepo and development standards | §2.1–2.3, S1 | Covered |
| 2 | Local Docker environment | §3.1, setup §2, S2, crit. 2 | Covered |
| 3 | Next.js application shell and design system | §7.1, S4 | Design system proved only by `next build`; accessibility declared "a launch requirement" with **no automated proof** |
| 4 | NestJS modular API | §7.2, S3 | Covered |
| 5 | PostgreSQL and Prisma baseline | §4, S5 | Covered, but see A1/A2/B4 |
| 6 | Configuration and secrets management | §7.3, setup §4, S2, crit. 11 | Covered |
| 7 | Tenant/subdomain resolution | §5, ADR-0001, S6, crit. 3/4 | Covered |
| 8 | Authentication and account activation | §6.1–6.2, ADR-0003, S7, crit. 6 | Covered |
| 9 | Roles, permissions and branch scopes | §6.3, §4.1, S8 | Branch scope has no acceptance criterion of its own; S8's proof "permission unit and API tests green" is not falsifiable as stated |
| 10 | Platform owner administration | §4.1, S9, crit. 5 | Baseline §8.3's "assign tenant subdomains **and branding**" is not covered anywhere; support access is blocked by A3 |
| 11 | Plans, quotas and usage metering | §6.4, S9 | Covered — all three modes exercised |
| 12 | **Audit logging** | §4.1 tables, §4.2 immutability | **Vaguest coverage.** Two tables and a revoke. No event taxonomy, no payload schema, no retention rule, no own acceptance criterion, no S-step whose proof is an audit assertion. See A5 |
| 13 | Redis, BullMQ and job monitoring | §8.1, S10 | Covered — named deliverable with an acceptance test |
| 14 | S3 storage abstraction | §8.3, S10 | Covered |
| 15 | CI/CD, test baseline and observability | §9, §10, §8.5, S11–S12 | See B2 |

### A5 — should-fix — audit logging needs a specification

Add a section defining the audited event vocabulary (auth success/failure, session rotation, privilege change, tenant lifecycle, `$asPlatform` invocation, support access open/close, quota breach, security rejections), the row shape, actor/tenant/request correlation, retention, and an acceptance assertion that a failed cross-tenant attempt produces exactly one immutable row and that `UPDATE`/`DELETE` on it is denied.

---

## D. Acceptance criteria

Baseline §18's nine map 1:1 onto plan criteria 1–9, in order, with no substitutions. Plan adds 10 (RLS/privilege coverage) and 11 (no committed secrets). Mapping is sound.

Falsifiability: criteria **1, 2, 4, 6, 7, 8, 10, 11** are concrete and falsifiable — criterion 7 is the strongest in the set. Criteria **3, 5** are falsifiable but see D2. Criterion **9** is still partly self-referential: "a workflow file exists containing these check names" is a file-content assertion, not a behavioural one.

**Fix for 9.** Make the proof "a deliberately-broken PR (unformatted file, an `any`, a failing cross-tenant test) is blocked by the named checks."

### D1 — should-fix — `gitleaks` semantics disagree between documents

Plan criterion 11: "`gitleaks` over **the diff** on every pull request." Setup §7 row 11: `gitleaks detect --no-git` — scans the working tree as plain files, ignoring git history entirely. Neither scans history, so a secret committed earlier in a branch passes. Pick one (`gitleaks detect --log-opts=<base>..<head>` for the PR range plus a full-history scan on `main`) and state it identically in both.

### D2 — should-fix — the E2E criteria have no defined CI execution path

Criteria 3, 5 and 6 require Nginx, TLS, `*.lvh.me` DNS resolution and seeded tenants inside the runner. Nothing addresses: installing the mkcert CA into Playwright's bundled browsers (Playwright does not use the system trust store by default), whether the runner can resolve `lvh.me`, or how `db:seed` runs against RLS-protected tenant tables. `db:seed` appears in setup §1 and §6 but in no turbo task, no S-step deliverable and no plan section.

**Fix.** Add a CI-specific hosts/CA step to §10.1, and specify the seed path (runs as `excelex_owner`, or sets `app.tenant_id` per tenant).

### D3 — see B2 for the setup §7 ↔ §1 ↔ plan §2.2 command mismatches.

---

## E. Prohibitions

| Prohibition | Verdict |
| --- | --- |
| MongoDB | Clean. No occurrence. |
| Microservices | Clean. Modular monolith explicit; DEC-006 reduces app count rather than increasing it. |
| Separate React/Vite app | Clean. |
| Copying Xpresion assets | Clean; §6.2 and ADR-0003 pt 7 explicitly forbid importing legacy hashes. |
| Courier business modules | Clean. §0's exclusion list is specific; permission strings like `operations.shipment.create` are labelled as vocabulary examples, not modules. |
| Speculative functionality | **Drift.** §16 removed the KMS abstraction for having "zero call sites" but retains three constructs with the same property: `user_mfa` for tenant users ("available, not enforced in Phase 1"), the §10.3 retention/purge job (whose own text says "the courier data it will act on arrives later"), and the concurrent-session listing "for the later licensing model". Either justify each the way idempotency and the outbox are justified, or defer them. The rule is currently applied inconsistently. |
| Patch-on-patch | **Violated by the documents themselves.** §10's 9.x subsections (B1); ADR-0003's decision points ordered **1, 2, 3, 4, 9, 5, 6, 7, 8** — point 9 was inserted mid-document during revision 2 rather than renumbered. |
| One-pass generation | Clean. S0–S13 each gated on the prior proof. |

---

## F. Internal consistency (beyond B1–B4)

**F1 — should-fix.** ADR-0001's local hostname table contradicts the TLS/proxy design: `lvh.me:3000`, `admin.lvh.me:3000`, `<slug>.lvh.me:3000` — direct Next.js ports. Plan §3.2, setup §3.1 and ADR-0001's own prose two paragraphs earlier all route through Nginx on 443 with mkcert TLS, which is *required* for `__Host-`. Revision 1 leftover. Change the Local row to `https://` forms.

**F2 — should-fix.** The "plain-HTTP fallback / unprefixed cookie name" is a dead branch contradicting the setup guide. ADR-0003 pt 2 and Consequences describe an unprefixed cookie name for "the plain-HTTP fallback", but setup §0 says mkcert is "required, not optional", setup §4 sets `SESSION_COOKIE_NAME=__Host-excelex_session` in the dev `.env`, and the §3.2 offline fallback also regenerates a certificate. No plain-HTTP mode exists anywhere. A conditional cookie-name code path with no configuration that reaches it is exactly the untested-branch problem §3.1 argues against.

**F3 — should-fix.** All three ADRs are `Accepted` while the decisions they embody are `Open`/`BLOCKING`. ADR-0002 is Accepted and states the RLS design as decided; DEC-007 is Open and offers options B ("Prisma extension only, RLS deferred") and C. ADR-0003 is Accepted with same-origin `/api/v1` as decided; DEC-005 is Open with option B live. `adr/README.md` defines Accepted as "Approved. Implementation may proceed," while `docs/README.md` says "Nothing proceeds to scaffolding until the blocking decisions are signed off."

**F4 — should-fix.** `excelex_readonly` is granted the inverse of what it needs. Setup §2.2 grants it `SELECT` on all future tables, and the revoke block names only `excelex_app`. So the reporting role can read `platform_users` (Argon2id hashes), `platform_user_mfa` (TOTP secrets) and every subscription — while seeing **zero tenant rows**, because it is under RLS with no policy and never sets `app.tenant_id`.

**F5 — should-fix.** The blanket `ALTER DEFAULT PRIVILEGES` grant makes every future platform table exposed by default. Any platform table added in Phase 2+ is automatically granted to `excelex_app` and must be *remembered* into the revoke list. The coverage check is the only backstop, and A1 shows it already failed once. Invert: `ALTER DEFAULT PRIVILEGES ... REVOKE ALL`, and have the generator emit explicit per-table grants for tenant tables — fail-closed instead of fail-open.

**F6 — nit.** `engines: { "pnpm": ">=11.5.2" }` is a range, contradicting matrix §6.1's "never a range"; setup §0 checks `node --version → v24.19.x` while `engines`/`.nvmrc` pin exactly `24.19.0` (a 24.19.1 patch passes the check and fails `engines`).

**F7 — should-fix.** The version matrix is incomplete relative to the plan's named deliverables. No pin for `bull-board` (§8.1), `@nestjs/throttler` (§6.5), OpenTelemetry SDK (§8.5), Sentry SDK (§8.5), `commitlint` (§2.3); `zod` is only "latest 4.x"; `helmet` appears in the §5 verification script but in no matrix table.

**F8 — should-fix.** PostgreSQL major has an unowned alternative that gates DEC-008. Matrix §2 says "PG 17.11 is the conservative alternative" — a live option with no DEC and no owner. DEC-008's justification ("PostgreSQL 18 offers native UUIDv7 generation") evaporates on PG 17, and DEC-010 may force 17. Neither DEC cross-references this. Also unspecified: whether UUIDv7 is generated DB-side (`uuidv7()`, PG18-only) or client-side (Prisma `uuid(7)`, version-independent).

**F9 — nit.** Plan §15: "The **one** structural deviation" — DEC-001's own text calls Node 24 "technically a deviation from 'Active LTS'". §15 reads as an exhaustive deviation list and is not.

---

## G. Technical soundness

**(a) `__Host-` prefix — CORRECT, with one overbroad sentence.** Requirements are exactly as stated: `Secure`, `Path=/`, no `Domain`, set from a secure origin. One unstated benefit worth adding: `__Host-` also prevents **cookie shadowing** — a compromised sibling subdomain cannot overwrite the session cookie with a `Domain=excelex.in` variant. On a same-site tenant fleet that is material and the docs miss it. Overbroad: "browsers only accept it over HTTPS" (setup §0) — Chrome and Firefox treat `http://localhost` as trustworthy and will accept `Secure`/`__Host-` cookies there. The conclusion still holds because `lvh.me` is not `localhost`.

**(b) `acme.excelex.in` / `api.excelex.in` same-site; host-only scope separates tenants — CORRECT.** "Site" for cookies is the registrable domain plus scheme, so the hosts are same-site and merely cross-origin; `SameSite=Lax` does not restrict requests between them. Host-only scope is the separating mechanism. The corollary — `SameSite` buys nothing between tenants, so CSRF needs explicit mitigation — is correct and correctly propagated to §6.5, ADR-0003 pt 9 and DEC-005. The chosen mitigation (`Origin` + `Sec-Fetch-Site` on non-safe methods) is right, and `Sec-Fetch-Site: same-site` is precisely what distinguishes a sibling tenant from a same-origin request. **Strongest section of the revision.**

**(c) `FORCE ROW LEVEL SECURITY` and bypass — CORRECT.** Table owners are exempt by default; `FORCE` removes that; superusers and `BYPASSRLS` roles are never constrained. Setup §2.3's `is_superuser` check is the right operational guard. **Missing subtlety:** RLS is not applied to referential-integrity checks, so a cross-tenant FK violation surfaces as a constraint error whose message can confirm the existence of another tenant's row. Composite `(tenant_id, id)` FKs largely neutralise this, but the error-message channel should be closed at the API error contract.

**(d) `WITH CHECK` rationale for `FOR ALL` policies — CORRECT.** With `WITH CHECK` omitted, PostgreSQL reuses the `USING` expression to validate new rows. Revision 1's claim (writes unprotected) was wrong; revision 2's replacement is accurate and is the right reason to keep the practice.

**(e) `nullif(current_setting('app.tenant_id', true), '')::uuid` — CORRECT, and better-motivated than the docs say.** Unset + `missing_ok = true` → `NULL`; `tenant_id = NULL` → row denied, failing closed. Empty string → `NULL` rather than `invalid input syntax for type uuid`. **The docs undersell it:** once a custom GUC has been set in a session, `RESET` and post-`SET LOCAL` reversion leave it defined as the **empty string**, not undefined — so on a pooled connection that has previously served a tenant request, the "unset" state *is* `''`. Without `nullif` this would throw on essentially every connection after the first. That changes the fix from defensive to mandatory. Residual gap: a malformed non-empty value still raises at query time; validate the UUID before `SET LOCAL`.

**(f) `SET LOCAL` requires a transaction; session-level `SET` leaks across pooled connections — both CORRECT.** `SET LOCAL` outside a transaction emits a warning and has no effect. A session-level `SET` persists for the connection's life and is inherited by the next borrower. "PgBouncer in transaction-pooling mode is compatible" is correct. **Two problems with the guard:** (1) §5.3 and §9 describe "an integration test asserts no session-level `SET` exists anywhere in the codebase" — that is a static text scan, not an integration test, and it will not catch `$executeRawUnsafe` with a composed string, an ORM-emitted statement, or a `SET` inside a migration. Make it a static rule **plus** a real integration test that returns a connection to the pool and asserts the GUC is cleared. (2) Calling it "the single highest-value test in the RLS design" is overstated — criterion 7's raw-SQL denial is. **Unstated but load-bearing:** Prisma against PgBouncer needs `pgbouncer=true`; not mentioned anywhere, and no pooler appears in the compose stack or S12.

**(g) Composite FK `MATCH FULL` — WRONG (A2). UNIQUE constraint vs index — SUBTLY WRONG, and it names the wrong trap (B4).** The third sub-claim — that composite relations make nested `create`/`connect` awkward and interact with the `tenantId`-injecting extension — is **CORRECT**, and the S5 single-relation proof is the right mitigation.

**(h) Prisma cannot nest `$transaction`; test isolation guidance — CORRECT.** The interactive-transaction client does not expose `$transaction`, so the pattern is unavailable by type. More precisely than the docs state: a test wrapping the SUT in an outer transaction does not "fail" so much as have the app's own `$transaction` acquire a **separate connection**, so the inner work commits independently and the outer rollback isolates nothing. Conclusion (truncation or template cloning; rollback for pure repository tests) is correct and consistently propagated. **Two operational caveats to add:** `CREATE DATABASE ... TEMPLATE` requires zero open connections to the template, and truncation must run as a role permitted to truncate RLS-protected tables — `excelex_app` will hit RLS, so cleanup should run as `excelex_owner`.

**(i) UUIDv7 in PostgreSQL 18 and index locality — CORRECT on both; "non-guessable" is SUBTLY WRONG.** PG 18 does ship `uuidv7()`. Time-ordered values append at the right edge of the B-tree, avoiding the random-v4 page-split problem. But UUIDv7 embeds a millisecond Unix timestamp: given an id you learn the row's creation time; given two you learn their order. For a platform whose premise is that competitors cannot infer each other's activity that is a real disclosure, and it undercuts DEC-008's framing. Restate as "non-enumerable, but creation-time-disclosing; ids must never be the sole authorisation token." Also unmentioned: 16-byte keys plus composite `(tenant_id, id)` FKs means every FK index carries 32 bytes.

**(j) `SECURITY DEFINER` for narrow platform reads — approach SAFE IN PRINCIPLE, specification UNSAFE AS WRITTEN.** See A4.

---

## H. New gaps (genuine foundation concerns)

1. **Connection pooling is a named cost with no named mechanism.** §5.3 makes every tenant request hold a connection; §14's mitigation is "revisit pool sizing"; DEC-007 says PgBouncer is compatible. No pooler is in the compose stack, S12, the matrix, or the env surface. Pool exhaustion is the most likely way this design fails in production.
2. **API error contract is referenced three times and specified nowhere.** S3's deliverables and §9's API-test row both say "error contract". This matters for tenancy: 404-vs-403-vs-402 on host rejection, and not leaking existence through constraint errors.
3. **Audit logging** — see A5.
4. **Rate limiting has no specified store.** §6.5 requires per-IP, per-session and per-tenant limits; across multiple containers that requires a shared Redis-backed store and a key scheme. In-memory throttling silently multiplies the limit by instance count.
5. **Session cache invalidation on revocation.** ADR-0003 makes "revocation is immediate and total" the headline reason for opaque sessions, then adds a Redis cache with DB fallback. Nothing specifies cache-delete-on-revoke or a TTL bound. As written the headline claim is unproven.
6. **CSP nonces vs Next.js 16 rendering modes.** §6.5 requires per-response nonces; nonces force dynamic rendering and interact with App Router static generation. Matrix §7 lists the Turbopack+Tailwind risk but not this one, which is more likely to bite.

---

## I. Decision quality — `03-DECISIONS-REQUIRING-APPROVAL.md`

| DEC | Option set | Straw man | Evidence supports recommendation | Blocking classification |
| --- | --- | --- | --- | --- |
| 001 Node | Complete | No | Yes | Correct |
| 002 TypeScript | Complete | No | Mostly — "community reports confirm `nest build` fails under TS 7" is asserted with no citation | **Wrong.** Its own text says the unknown is "answerable in an hour at S3" and names a fallback. Reclassify **BLOCKING AT S3** |
| 003 Validation | **Incomplete** | **Yes — option C.** "Both, permanently duplicated" is offered only to be dismissed | Yes for A over B | Correct |
| 004 Prisma | Thin (no table) | No | Internally inconsistent: body says "re-evaluate at S13", sign-off says "revisit at 8.0 GA". S13 is the last step | Arguably wrong: the client-extension API is the tenancy mechanism, exercised from S5. Reclassify **BLOCKING AT S5** |
| 005 API hostname | **Incomplete** | Option C is not distinct — it is A "stated as a roadmap". The genuine third option, **Next.js rewrites as the proxy**, is rejected in prose but never given a row | Yes; the same-site correction is well argued | Correct |
| 006 Worker | Complete | Option C is weak but honestly labelled | Yes | Correct |
| 007 RLS cost | Complete | No | **The decision is not open.** Plan §1 C3 records it as *Confirmed*, ADR-0002 is *Accepted*, and the recommendation says "this was confirmed". Yet it presents live options B and C. Decision theatre, and it contradicts F3 | Reframe as a **cost-acknowledgement record** |
| 008 Identifiers | **No options at all** | — | Reasonable but unjustified against alternatives; "non-guessable" overstated; silent on DB-side vs client-side generation and the PG 18 dependency (F8) | Classification correct — which makes the missing option set the worst gap. **It is the one genuinely irreversible choice** and the only blocking decision with no alternatives. `bigserial`, UUIDv4, ULID, and "v7 PK + separate public-facing opaque id" all deserve rows |
| 009 Redis/Valkey | No options table | — | Two evidence problems: Redis 8 is **tri-licensed** (AGPLv3 or RSALv2 or SSPLv1), not simply AGPLv3; and unmodified Redis as a backing store does not engage AGPL §13 | **Overstated.** Its own text says substitution is "a Docker image change" — reversible at any time. Downgrade from BLOCKING AT S2 |
| 010 Hosting/RLS | No options | — | Sound | Correct at S5, but this is a **verification task**, not a decision — no options and no recommendation to approve |
| 011 Custom domains | No options | — | Sound and cheap | Correct |

**Cross-cutting.** The sign-off table is consistent with the DEC headers and plan §13 (6 blocking / 3 step-gated / 2 deferred), and README's "Six … three more" matches. But six of eleven decisions have no options table at all, while the preamble promises "the options" for each. The two with the highest irreversibility (DEC-008, DEC-010) have the least analysis; the two already settled (DEC-005, DEC-007) carry the fullest option sets. That is inverted.

---

## Ranked summary

**Blockers:** A1 (`tenant_hostnames` ungoverned — cross-tenant hostname takeover), A2 (`MATCH FULL` breaks optional relations; the revision 2 fix is wrong), A3 (platform/support read path under RLS undefined; `$asPlatform` and pre-tenant security audit have no working table), A4 (`SECURITY DEFINER` specified without `search_path` pinning or `EXECUTE` control).

**Should-fix, highest first:** B4 (partial unique indexes cannot back FKs — collides with the mandated soft-delete convention), B2 (`docker:build` / `smoke:infra` / `format:check` / `check:rls` mismatches make criteria 1 and 9 unexecutable), H1 (no pooler despite per-request connection holding), F4/F5 (readonly role inverted; default privileges fail open), A5 (audit logging is the thinnest baseline §11 bullet), D2 (E2E criteria have no CI execution path), F3 (Accepted ADRs depend on Open blocking decisions), DEC-008 (the only irreversible decision has no option set), B1/B3/F1/F2 (renumbering and revision leftovers — the §16 row claiming these were fixed is false), F7/F8, H2, H4, H5, G(f)-1 (grep mislabelled as an integration test), D1.

**Nits:** F6, F9, H6, `pnpm verify` omits `build`/`test:e2e`, `DATABASE_TRANSACTION_TIMEOUT_MS` maps to Prisma's `timeout` but not `maxWait`, baseline §8.3 "branding" uncovered, `@excelex/api` package name used in setup §7 but never declared.

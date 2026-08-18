# Audit 4 — Foundation review

**Date:** 18 August 2026
**Scope:** everything built to date — 31,572 lines across `apps/api`, `apps/web`, `packages/*`
**Question asked:** is this foundation strong enough to grow on, sell to other companies, and run under real traffic without a rewrite?

**Answer:** the hard parts are right. The parts that are wrong are the ones that get harder to fix every week, and two of them should be fixed before the next feature.

---

## What is genuinely strong

These are not filler. They are the decisions that would be expensive to retrofit and are already correct:

| Area | Why it holds up |
| --- | --- |
| **Client isolation** | Two independent barriers — a Prisma extension and Postgres RLS with `FORCE` — proven by 33 executable assertions over 33 tables, re-run on every schema change. Most multi-tenant products have one barrier and a promise. |
| **Least privilege** | Four database roles, deny-by-default grants, `ALTER DEFAULT PRIVILEGES … REVOKE`. The runtime role cannot read the platform tables at all; that is asserted, not assumed. |
| **Authorization model** | Several roles per user, direct grants, DENY that beats any ALLOW, expiry, branch scope, wildcards — resolved by pure functions with 35 unit tests. Ahead of Spatie, which has no DENY. |
| **The policy table** | One place says what each action needs; the API and the browser both read it. This is what stops permission strings drifting across 40 screens. |
| **Money and exactness** | `Decimal` end to end, passed as strings across the wire. No float has ever touched a rupee here. |
| **Migration discipline** | Every migration reviewed and applied forward; `db:check-drift` proves schema and migrations agree; partial unique indexes and check constraints written by hand where Prisma cannot express them. |
| **Audit trail** | Append-only to every runtime role, enforced by revoked privileges rather than by convention. |
| **Decision record** | Three ADRs, three prior audits, a glossary that makes `client` vs `customer` binding. The reasoning is recoverable by someone who was not here. |

---

## P1 — Fix before the next feature

### 1. There are no tests for the API or the web app

**Evidence:** 31,572 lines of application code. Three test files, all in `packages/permissions`, all pure functions. Zero tests over 88 master routes, RLS behaviour under a real request, the import engine's commit path, or any screen.

**Why it matters more than it looks:** every audit finding below is a change to code nobody can refactor safely. The isolation proof covers the database; nothing covers the application above it. A regression that drops `deletedAt: null` from a `where` clause, or loses a `clientId` in a service, passes typecheck and build today.

**Fix:**
- API integration tests against a real Postgres (Testcontainers or the existing compose stack) covering: a request as client A cannot read client B's rows through any endpoint; a role without a permission gets 403; the import engine's all-or-nothing commit actually rolls back.
- A smoke test per master screen — renders, filters, opens the form.
- Target for the first pass: the auth guard, one paged master end to end, one import end to end. That is a day's work and it protects everything.

### 2. No CI

**Evidence:** no `.github/workflows`. `pnpm run build`, `typecheck`, `test` and `verify-isolation.sh` exist and are run by hand.

**Why it matters:** the isolation proof is the single most valuable thing in this repository and nothing forces it to run. The day someone adds a client-scoped table and forgets the RLS policy, the only thing that catches it is remembering to run a script.

**Fix:** one workflow on every push — typecheck, lint, unit tests, build, then `verify-isolation.sh` against a service container. Fail the build on a drift check that reports a difference.

### 3. Authentication costs five statements and a write on every single request

**Evidence:** `AuthService.authenticate` opens a transaction, then runs `securitySettings.findFirst`, `session.findFirst` with a four-level include, and `session.update` to slide the idle window — for every request, including reads.

Compounding it: pages compose from several API calls. `customers/[id]` makes seven. Each one re-authenticates.

> One view of the customer edit screen ≈ 7 HTTP requests × (BEGIN + set_config + 3 statements + COMMIT) ≈ **42 database round trips before a single row of customer data is fetched.**

**Why it matters:** this is the number that decides how many concurrent users one database can hold. It also means a write (`session.update`) on every read request — row contention on `sessions` and WAL churn proportional to traffic, not to actual session changes.

**Fix, in order of value:**
1. **Slide the idle window at most once a minute.** If `idleExpiresAt` is more than 60 seconds in the future, skip the update. Removes ~95% of session writes at no security cost — the window is measured in tens of minutes.
2. **Cache the security settings** per client with a short TTL. They change once a year.
3. **Cache the resolved actor** against the token hash for 30–60 seconds, in memory now and Redis when there is more than one API process. Session revocation must invalidate it — that is the design work, and it is small.
4. **Fetch page data in one call.** A screen that needs seven lists should ask for seven lists once, not seven times.

### 4. `masters.controller.ts` is 1,596 lines and 88 routes

**Evidence:** one file holds every master endpoint, every Zod schema, and every export handler.

**Why it matters:** it is the file every feature touches, so it is the file every merge conflicts in. It is also where a route ordering bug already bit once — `destinations/:id` declared before `destinations/options`, which made the options endpoint unreachable and surfaced as a permission error.

**Fix:** one controller per master, each next to its service. The schemas move with them. This is mechanical, and it gets more expensive every week.

---

## P2 — Fix before real traffic

### 5. Search cannot use an index

**Evidence:** 20 uses of `contains` with `mode: "insensitive"`, which Prisma renders as `ILIKE '%term%'`. No `pg_trgm` extension, no GIN indexes.

**Why it matters:** a leading wildcard cannot use a B-tree. Every customer search is a sequential scan. At 500 rows nobody notices; at 50,000 across several clients it is the slowest thing in the product, and it runs on every keystroke-driven filter request.

**Fix:** `CREATE EXTENSION pg_trgm`, then GIN trigram indexes on the searched columns of the paged masters — customers, consignees, shippers, destinations. Consider a generated `search_vector` column if search needs to span several fields.

### 6. Every request holds a transaction for its whole life

**Evidence:** `withClientContext` wraps all client-scoped work in `$transaction`, because `set_config('app.client_id', …, true)` is transaction-local — which is exactly what makes it safe on a pooled connection.

**Why it matters:** the design is right and the cost is real. A pooled connection is held for the duration of a request rather than the duration of a query, so the pool size, not CPU, becomes the concurrency ceiling. Read replicas cannot be introduced later without touching this path.

**Fix:** not a rewrite — a ceiling to measure and two cheap improvements. Mark read-only paths `SET TRANSACTION READ ONLY` so a future replica router can use them; set an explicit pool size per process and load-test to find the ceiling before a customer does.

### 7. Two masters are 80% the same file, twice

**Evidence:** `consignee.service.ts` and `shipper.service.ts` differ in 51 lines out of ~280. Their managers, forms and actions differ by roughly as much. The `customers`/`consignees`/`shippers` list managers are three copies of one screen.

**Why it matters:** the paging bug fixed in one is still in the other two. This is already true — the shared `Pager` was extracted only after it had been written twice.

**Fix:** a `createMasterService` factory for the CRUD shape (list, byId, create, update, soft delete, audit), and a `<MasterListScreen>` for the paged-list-with-filter-bar shape. The bespoke parts stay bespoke; the ceremony stops being copied.

### 8. Navigation blocks on all data

**Evidence:** zero `loading.tsx` files. Every page awaits every API call before rendering anything.

**Why it matters:** perceived performance is most of performance. A screen that shows its heading and a skeleton in 100ms feels faster than one that shows nothing for 400ms, even when the second is faster in total.

**Fix:** a `loading.tsx` per route group with a table skeleton, and `<Suspense>` around the slow half of composite pages.

### 9. Masters that will grow are read whole

**Evidence:** nine list services have no `skip`/`take` — products, charges, service centres, account groups, zones, departments, designations, sales executives, customer detail lists.

**Why it matters:** most of those are genuinely small and paging them would be over-engineering. Products and charges are not: a courier accumulates thousands of both, and the filter bar's own documentation says client-side filtering is honest only while a master fits in one response.

**Fix:** move products, charges and service centres onto the paged pattern the customer list already uses. Leave the small ones alone and write down why.

---

## P3 — Before selling to a second company

### 10. No rate limiting anywhere

Account lockout protects a known username. Nothing protects against credential stuffing across many usernames, or against a script hammering an export endpoint that reads 20,000 rows. Add per-IP throttling on `/auth/*` and a global ceiling; export deserves its own, lower limit.

### 11. Observability is a console

The exception filter issues a reference per error, which is good. There is no request id threaded through logs, no metrics, no slow-query visibility. Before there are other companies on this, add a request id in middleware, structured JSON logs carrying it, and a metrics endpoint. Otherwise "it was slow yesterday" is unanswerable.

### 12. Accessibility gaps in the components everyone uses

The searchable select renders `id="filter-options"` for every instance, so several on one screen produce duplicate ids and `aria-controls` pointing at the wrong element. The filter bar has no `aria-label` distinguishing one bar from another. Forms are otherwise good: real `<label>` wrapping, `aria-label` on icon-only buttons, `role="alert"` on errors.

### 13. Tables do not adapt to a phone

Ten-column tables scroll horizontally on mobile. That is acceptable for an operations tool used at a desk, but the booking and tracking screens will be used on a phone at a counter. Decide per screen: a card layout below `sm`, or an explicit "this screen is desk-only".

### 14. No data retention story

Soft deletes accumulate for ever; `audit_events` and `sessions` grow without bound. Before a second client, decide retention per table and add a job. The `excelex_jobs` role already exists for exactly this.

---

## UI/UX assessment

**Working well:** one design language across 40 screens; brand tokens with light and dark both defined at every layer; consistent form/list/filter patterns; every destructive action confirms; empty states say what to do rather than "no data"; error messages name the actual reason ("Domestic is used by 7 product(s)") instead of "operation failed"; reduced-motion honoured throughout.

**Gaps worth naming:**
- **No optimistic UI anywhere.** Every save is a round trip with a spinner. Fine for masters, wrong for the booking screen that is coming.
- **No toast/confirmation system.** A successful save navigates away silently; the user infers success from the absence of an error.
- **No inline validation.** Errors arrive from the server on submit. For a 90-field customer form that is a long walk back.
- **No bulk actions.** Selecting fifty rows and deactivating them is a normal master-data task and there is no path to it.
- **The 90-field customer form is one page.** Sections help, but it is long. Watch whether people actually complete it; if not, progressive disclosure beats a wizard.

---

## Sequence

**Now, before the next feature:** CI (2 hours). Session write throttle and actor cache (half a day). Split the masters controller (half a day). First integration tests (one day).

**Before real traffic:** trigram indexes. Page the three growing masters. Loading skeletons. The service and screen factories.

**Before the second client:** rate limiting. Request ids and structured logs. Retention jobs. The accessibility fixes.

**Explicitly not now:** microservices, event sourcing, a queue, GraphQL, a component library. None of them solve a problem this codebase has, and each would cost more than it returns at this size.

---

## The honest summary

The foundation is stronger than most projects at this stage, in the places that are hardest to change later: isolation, authorization, money, migrations. It is weaker than it should be in the places that are cheap to fix now and expensive to fix at 100,000 rows: tests, CI, the per-request authentication cost, and one very large file.

Nothing here requires an architectural rewrite. That was the question, and the answer is no.

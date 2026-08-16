# Decisions Requiring Approval Before Phase 1 Code Generation

**Status:** Open
**Prepared:** 16 August 2026

Each decision below follows the format the project instructions require: what is known, what is unknown, the options, a recommendation, and the effect of each option.

Decisions are labelled by the step they gate, not by convenience. **BLOCKING** means scaffolding cannot start; **BLOCKING AT S2/S5** means the step named in `00-IMPLEMENTATION-PLAN.md` §12 cannot start, and in the case of S5 the choice becomes effectively irreversible afterwards. **Before phase end** means it can be deferred but not forgotten.

---

## DEC-001 — Node.js runtime line — **BLOCKING**

**Known.** Node 24 (24.19.0) entered Maintenance LTS around 3 August 2026 after roughly a year as Active LTS. Node 26 (26.7.0) became Active LTS around 5 August 2026 — eleven days before this document. Node 22 is in maintenance and ends July 2026. The foundation document specifies "Active Node.js LTS", which literally reads as Node 26.

**Unknown.** Whether the full dependency set (Prisma engines, `@node-rs/argon2` prebuilds, Playwright, Turborepo binaries, native modules in transitive dependencies) has published Node 26 builds and been exercised at scale. Eleven days is not enough time to know. Also unknown is ExcelEx's production hosting, which may pin available Node versions.

**Options.**

| Option | Effect |
| --- | --- |
| **A. Node 24.19.x now** | Ecosystem-proven; maintenance support runs to roughly April 2028, comfortably past first production release. Costs one planned upgrade to Node 26 in three to six months. Technically a deviation from "Active LTS". |
| B. Node 26.x now | Literal compliance with the baseline; longest runway; newest native TypeScript support. Risk of being the first team to hit a native-module gap, discovered during S5–S7 when attention should be on client isolation. |
| C. Node 24 in CI, Node 26 in a parallel CI job | Both signals, no commitment. Costs CI minutes and a second lockfile-compatible matrix. |

**Recommendation: A, with C as a cheap addition.** Pin Node 24.19.x for Phase 1, add a non-blocking Node 26 CI job from S1 so the upgrade is evidence-driven, and schedule the move to Node 26 once 26.x has reached a mature patch level. A courier platform holding other companies' financial data is the wrong place to be an early adopter of an eleven-day-old runtime.

**Effect if rejected:** choosing B is defensible; it moves runtime risk into the critical path of the client isolation work rather than after it.

---

## DEC-002 — TypeScript line — **BLOCKING**

**Known.** TypeScript 6.0.3 is the current stable release. TS 6.0 is explicitly a bridge: `strict` now defaults to `true`, `module` to `esnext`, `target` to `es2025`, and `baseUrl` and several legacy options are deprecated ahead of removal in TS 7. TypeScript 7 is the native (Go) port; it ships **without a programmatic compiler API**, and `nest build` calls that API directly (`createProgram`, `program.emit`). Community reports confirm `nest build` fails under TS 7, and that ts-jest, ts-loader, the Swagger CLI plugin and type-aware ESLint rules break with it too. Decorator metadata itself is emitted correctly by TS 7.

**Unknown.** Whether NestJS 11.1.24 builds cleanly under TS 6.0.3 with the changed defaults, and whether the Swagger CLI plugin behaves. This is answerable in an hour at step S3.

**Options.**

| Option | Effect |
| --- | --- |
| **A. TypeScript 6.0.3, all options set explicitly** | Current stable; forward-aligned with TS 7 deprecations. Requires an explicit `tsconfig.base.json` rather than relying on defaults. |
| B. TypeScript 5.9.x | Maximum compatibility with the NestJS 11 toolchain; a known-good combination. Accumulates upgrade debt and will need the TS 6 deprecation work later anyway. |
| C. TS 6 for build, TS 7 (`tsgo`) for a separate fast typecheck | Faster CI feedback. Adds a second compiler to reason about; premature before the build is stable. |

**Recommendation: A, proven at S3, with B as a documented fallback.** Set every compiler option explicitly so changed defaults cannot alter emitted output silently. If Nest DI fails to resolve under TS 6, fall back to 5.9.x and record it — this is exactly the kind of thing that should be discovered by a five-file scaffold rather than by a half-built API.

---

## DEC-003 — Validation library: Zod instead of class-validator — **BLOCKING**

**Known.** The NestJS default is `class-validator` + `class-transformer`. The published NestJS 12 roadmap (approximately Q3 2026) moves to Standard Schema validation and retires `class-validator`. The baseline document lists a shared `packages/validation` but does not mandate a library. The frontend needs the same rules for form validation.

**Unknown.** The exact NestJS 12 release date and whether its migration path favours one library.

**Options.**

| Option | Effect |
| --- | --- |
| **A. Zod via a Standard-Schema pipe** | One schema shared by `apps/api` and `apps/web`; validation and TypeScript types derive from a single source; aligned with the v12 direction. Costs a small custom pipe and loses `@ApiProperty` decorator inference for OpenAPI, which is recovered with a Zod-to-OpenAPI generator. |
| B. class-validator + class-transformer | Conventional Nest, richest documentation, automatic Swagger inference. Rules cannot be shared with the frontend, so they get duplicated — and duplicated validation rules drift. Known to be on the way out. |
| C. Both — class-validator at the API edge, Zod in the frontend | Familiar and immediate. Guarantees the drift in option B, permanently. |

**Recommendation: A.** In a system where a validation rule and a business rule are often the same sentence, having one definition consumed by both the API and the browser is worth a small amount of custom wiring. It also means the NestJS 12 upgrade is a routine bump rather than a rewrite of every DTO.

---

## DEC-004 — Prisma major line — Before phase end

**Known.** Prisma 7.9.1 is current stable (late July 2026). Prisma 8.0.0-rc.1 appeared around 7 August 2026.

**Unknown.** The 8.0 GA date and its migration surface, particularly around client extensions — which this architecture depends on heavily for client scoping.

**Options.** A: pin 7.9.1 and revisit at 8.0 GA. B: adopt 8.0 RC now. C: wait for 8.0 GA before starting.

**Recommendation: A.** An RC is not an acceptable dependency for the system of record, and waiting stalls the phase for an unknown period. Re-evaluate at S13 with the client extension as the specific compatibility question, and treat the upgrade as a scheduled task with the cross-client suite as its acceptance test.

---

## DEC-005 — API hostname and session topology — **BLOCKING**

**Known.** The baseline leaves the API hostname strategy open (§8.1 lists `api.excelex.in` conditionally). Sessions are per-host HTTP-only cookies (confirmed, ADR-0003).

One point must be stated precisely, because the intuitive version of it is wrong and an earlier revision of this document got it wrong. `acme.excelex.in` and `api.excelex.in` are **same-site** — cookie "site" means the registrable domain, `excelex.in` — so they are merely cross-*origin*, and `SameSite=Lax` would not block requests between them. What actually confines a session to one host is that a `__Host-` cookie is **host-only**: with no `Domain` attribute, the browser sends it to `acme.excelex.in` and nowhere else. A separate API host therefore requires a parent-domain cookie to reach it, which is incompatible with `__Host-` and is the same weakening ADR-0003 rejects on its own merits.

The corollary matters for the whole platform: **`SameSite` provides no protection between clients**, since every client subdomain shares a site. CSRF must be mitigated explicitly wherever the API lives.

**Unknown.** Whether ExcelEx wants a public machine-to-machine API hostname at launch, and whether any customer integration is committed for the first release.

**Options.**

| Option | Effect |
| --- | --- |
| **A. Same-origin `/api/v1` on each host, proxied by Nginx** | The browser only ever talks to `acme.excelex.in`, so `Set-Cookie` comes from that host and the `__Host-` prefix holds. No parent-domain cookie, no CORS credentials surface. `api.excelex.in` stays reserved for later token-authenticated machine-to-machine use, where there is no cookie at all. Costs one proxy hop. |
| B. Separate `api.excelex.in` for browser traffic | One API hostname for everything. Requires `Domain=.excelex.in` on the session cookie so it reaches the API host — incompatible with `__Host-`, and it transmits every client's session to every client host. Plus a per-client CORS origin allowlist with credentials enabled. |
| C. Same-origin now, `api.excelex.in` added later for customer APIs | Option A, stated as a roadmap. |

**Recommendation: A, explicitly framed as C, with Nginx as the proxy mechanism.** Nginx rather than Next.js rewrites, because Nginx is already in the request path for TLS termination and trusted-host resolution in both development and production, so the proxy is one configuration file rather than a second hop through the Node process. This also means `Set-Cookie` originates from the client host, which is what criterion 6 asserts.

**Effect if rejected:** option B costs the `__Host-` guarantee — the single mechanism that keeps a stolen session useless on another client's host.

---

## DEC-006 — Worker as a second entrypoint, not a third application — **BLOCKING**

**Known.** Foundation §7 proposes `apps/worker` alongside `apps/api`. BullMQ workers need the same domain services, the same Prisma client, the same client context and the same audit spine as HTTP handlers.

**Unknown.** Nothing material; this is a structural choice.

**Options.**

| Option | Effect |
| --- | --- |
| **A. `apps/api` with `main.http.ts` and `main.worker.ts`** | One domain layer, one module graph, one set of tests. Deploys as two containers with different commands and independent scaling. Deviates from the layout drawn in the baseline document. |
| B. Separate `apps/worker` importing shared packages | Matches the baseline layout literally. Forces domain services out into packages purely to be importable — a package boundary created for mechanical reasons rather than design ones, which tends to erode into a shared "misc" package. |
| C. Separate `apps/worker` importing from `apps/api` | Matches the layout and avoids fake packages, but an app importing another app's internals is worse than either alternative. |

**Recommendation: A.** The modular monolith's value is one coherent domain layer; two deployables from one codebase preserves that while still giving independent scaling and failure isolation. This is a deliberate, documented deviation from the baseline drawing and needs explicit sign-off rather than quiet adoption.

---

## DEC-007 — Accepting the cost of RLS transaction scoping — **BLOCKING**

**Known.** PostgreSQL RLS reads client identity from a session variable. `SET LOCAL app.client_id` is only meaningful inside a transaction, so every client-scoped request runs its database work in a Prisma interactive transaction. That means one extra round trip per request and a connection held for the request's database duration. PgBouncer in transaction-pooling mode is compatible; session pooling is not required. The application must connect as a role that is neither superuser nor table owner, and tables need `FORCE ROW LEVEL SECURITY` or the owner silently bypasses every policy.

**Unknown.** The actual latency and connection-pool impact at ExcelEx's volumes, which foundation §16 lists as still-unquantified.

**Options.**

| Option | Effect |
| --- | --- |
| **A. Accept it; measure at S5** | Two independent barriers between clients. Costs latency and pool pressure; requires disciplined role management in every environment. |
| B. Prisma extension only, RLS deferred | Lower latency and simpler operations. The database has no opinion about client isolation, so any raw query, migration script, reporting tool or future service can read across clients. |
| C. RLS only on high-sensitivity tables | Partial protection with most of the operational complexity, plus a judgement call about which tables are sensitive — in a courier billing system, most of them are. |

**Recommendation: A.** This was confirmed as the isolation approach; this decision records that its cost is understood and accepted rather than discovered later. Benchmark at S5 with a documented threshold: if median client-scoped request latency rises by more than 15 ms, revisit with connection-pool tuning before revisiting the design.

---

## DEC-008 — UUIDv7 primary keys — **BLOCKING AT S5**

**Known.** UUIDv7 is time-ordered, so it retains B-tree insert locality while remaining non-guessable. Sequential integers leak volume and invite enumeration across clients. PostgreSQL 18 offers native UUIDv7 generation.

**Recommendation: UUIDv7 `uuid` columns for all primary keys**, with human-facing numbers (AWB, invoice, manifest) issued separately by a client-scoped sequence service using row-level locking. Keeping the two concerns apart is what allows AWB numbering rules — still an open business question in foundation §16 — to change later without touching a single foreign key.

---

## DEC-009 — Redis or Valkey — **BLOCKING AT S2**

**Known.** Redis 8 is licensed AGPLv3. Valkey is the BSD-licensed fork. Both work with BullMQ. Self-hosting AGPL software for internal use does not trigger source-distribution obligations, but ExcelEx is selling a platform and may prefer to avoid the question entirely.

**Recommendation: Redis 8 unless ExcelEx's commercial or legal position prefers BSD**, in which case Valkey substitutes with no application change. The `CacheService` and queue configuration are written so that this is a Docker image change, not a code change.

---

## DEC-010 — Hosting region and managed PostgreSQL RLS support — **BLOCKING AT S5**

**Known.** The isolation design requires creating custom roles, granting selectively, and applying `FORCE ROW LEVEL SECURITY`. Most managed PostgreSQL offerings permit this; a few restrict role creation or superuser-adjacent operations.

**Unknown.** ExcelEx's hosting provider, region and data-residency requirements — foundation §16 lists backup retention and hosting region as open.

**Recommendation: confirm before S5** by running the RLS proof test against a trial instance of the intended provider. Indian data-residency expectations for courier and billing data should be confirmed with the business at the same time. Discovering an RLS restriction after the schema is built is an expensive way to learn it.

---

## DEC-011 — Client custom domains — Before phase end

**Known.** Foundation §16 asks whether clients need custom domains in addition to subdomains. This plan does not implement them, but models hostnames in a `client_hostnames` table rather than parsing a slug from the host, so the door stays open at no extra cost today.

**Recommendation: keep the table design; defer the feature.** If custom domains are later confirmed, the additional work is certificate provisioning and a domain-verification flow — not a change to client resolution. Confirming the business intent now still helps, because it determines whether TLS automation belongs in the Phase 1 infrastructure work or later.

---

## Sign-off

| Decision | Blocking | Recommendation | Approved | Date |
| --- | --- | --- | --- | --- |
| DEC-001 Node line | Yes | Node 24.19.x + Node 26 CI job | | |
| DEC-002 TypeScript line | Yes | TS 6.0.3, fallback 5.9.x | | |
| DEC-003 Validation | Yes | Zod via Standard Schema pipe | | |
| DEC-004 Prisma line | No | 7.9.1, revisit at 8.0 GA | | |
| DEC-005 API hostname | Yes | Same-origin `/api/v1` via Nginx; `api.` reserved | | |
| DEC-006 Worker topology | Yes | Second entrypoint in `apps/api` | | |
| DEC-007 RLS cost | Yes | Accept; benchmark at S5 | | |
| DEC-008 Identifiers | At S5 | UUIDv7 | | |
| DEC-009 Redis/Valkey | At S2 | Redis 8 unless licence concern | | |
| DEC-010 Hosting/RLS | At S5 | Verify against a trial instance | | |
| DEC-011 Custom domains | No | Model now, defer feature | | |

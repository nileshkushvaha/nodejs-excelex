# Continuation Prompt — ExcelEx Phase 1 Implementation

Paste the block below into a **new Cowork task running "On your computer"** (desktop app → "Run this task" picker, top right, when starting a new task).

---

## Why a new session

The previous session ran in Anthropic's cloud sandbox, which cannot build this project:

- `npm install` returns `403 Forbidden` for every package — the registry is blocked by proxy policy
- No Docker daemon (`/var/run/docker.sock` absent), so no PostgreSQL and no Redis
- The bridge to the Mac can write files but its shell has no network access

Code could be written but not installed, built, migrated or tested — which fails the Phase 1 completion bar. Running on your computer is the only mode where the isolation guarantees can be proven rather than asserted.

---

## Repository state at handoff

`~/Sites/nodejs/excelex-log` contains **documentation only**. No code, no `package.json`, no migrations, no Docker files, no CI.

```
docs/
├── ExcelEx-NodeJS-SaaS-Project-Foundation.md   ← baseline, authoritative
├── README.md
├── adr/
│   ├── README.md
│   ├── ADR-0001-client-hostname-contract.md
│   ├── ADR-0002-client-isolation.md
│   └── ADR-0003-session-and-auth-boundary.md
├── phase-1/
│   ├── 00-IMPLEMENTATION-PLAN.md
│   ├── 01-VERSION-MATRIX.md
│   ├── 02-SETUP-GUIDE.md
│   ├── 03-DECISIONS-REQUIRING-APPROVAL.md
│   └── CONTINUATION-PROMPT.md               ← this file
└── audits/
    ├── AUDIT-1-revision-2-consistency.md
    ├── AUDIT-2-security-threat-model.md
    └── AUDIT-3-version-verified-triage.md   ← READ FIRST
```

Git is not yet initialised.

---

## Owner decisions already made — do not re-ask

1. **Single local host.** `http://localhost:3000`. No `lvh.me`, no wildcard DNS, no `/etc/hosts` edits, no mkcert, no nginx in the development loop. `__Host-` cookies work because browsers treat `http://localhost` as a secure context. Platform admin may use `http://admin.localhost:3000` (resolves natively in Chrome and Firefox, zero configuration); if that is unwanted, use a separate port with a distinct cookie name.
2. **ExcelEx only, first.** One client, seeded as a single `client_hostnames` row `localhost` → ExcelEx. The MULTICLIENTPATTERN data model stays — it is baseline-finalized — but no second client is created except inside cross-client tests.
3. **ExcelEx is both platform owner and client #1.** Separate accounts, separate tables, separate sessions.
4. **Nginx is a deployment artifact**, written at the final milestone. The trusted-proxy forwarded-header contract is proven by a test that simulates the header, not by running nginx locally.
5. **Support access policy** is set: read-only default, explicit reason, short expiry, step-up authentication, full audit, client notification, stronger approval for write, consent model configurable.
6. **No broad `$asPlatform` bypass** callable from client code.
7. Stack per baseline: TypeScript strict, Node LTS, pnpm workspaces, NestJS, Next.js, PostgreSQL, Prisma, Redis, BullMQ, Tailwind, shadcn/ui, REST `/api/v1`, OpenAPI, Docker Compose, GitHub Actions, modular monolith. No MongoDB, no microservices, no separate React/Vite app, no courier business modules.

---

## The prompt to paste

> Continue ExcelEx Phase 1 implementation. The repository is `~/Sites/nodejs/excelex-log` and currently contains documentation only — no code.
>
> **Read first, in this order:** `docs/audits/AUDIT-3-version-verified-triage.md`, then `docs/ExcelEx-NodeJS-SaaS-Project-Foundation.md` (authoritative baseline), then `docs/phase-1/CONTINUATION-PROMPT.md` for the owner decisions already made, then the Phase 1 plan and ADRs.
>
> AUDIT-3 matters most: it verified the security threat model against the pinned Prisma 7.9.x, Next.js 16.3.x and PostgreSQL 18 versions and **rejected several findings as outdated**. Do not implement the rejected corrections — specifically, do not rewrite Prisma `findUnique`/`update`/`delete` to `findFirst`/`updateMany`/`deleteMany`, do not set `dynamic = 'force-dynamic'`, do not set `Vary: Cookie, Host`, and do not use `MATCH FULL` on composite foreign keys. AUDIT-3 also records two new confirmed defects the earlier audits missed: Prisma client extensions do not intercept nested writes, and `upsert`'s create branch bypasses client scoping. Both must be handled.
>
> You are authorized to work autonomously: correct the planning documents, resolve confirmed audit findings, reject false positives, create the monorepo, install dependencies, generate code, create migrations and Docker and CI configuration, run commands and tests, and make local Git commits at verified checkpoints. Do not push, deploy, create cloud resources or use production credentials.
>
> Stop and ask only for: an irreversible business or contractual policy; a destructive action; unavailable credentials or external access; a direct contradiction between two baseline requirements; a security fix that would change a finalized product decision rather than refine it; unexpected existing work that would be overwritten; or legal authorization for Xpresion data.
>
> Do not stop to present another plan, to report intermediate progress, to ask whether to continue to the next milestone, or to ask permission for a reversible technical decision.
>
> **Execution loop:** read state → select next milestone → implement → run focused tests → run lint and typecheck → run affected builds → adversarial review via subagent → fix confirmed defects → update docs → commit → continue automatically.
>
> **Milestone order:** A repository foundation · B local infrastructure (Postgres, Redis, Docker Compose, typed env validation, health checks) · C database and tenancy (Prisma schema with explicit model-scope classification, roles and grants, RLS, parameterised `set_config` client context, composite integrity, live database security assertions, cross-client tests) · D host and request context (single-host resolution, AsyncLocalStorage, fail-closed, shared host fixtures) · E authentication and authorization · F platform administration vertical slice · G worker and storage · H Next.js foundation · I CI, documentation and closure.
>
> **Before code:** run one concise internal triage of the audit findings against the current documents and pinned versions, fix the confirmed pre-code design defects in the planning documents and ADRs, then begin implementing immediately. Keep unresolved ADRs marked Proposed. Do not produce another large user-facing audit report.
>
> Maintain `docs/phase-1/PROGRESS.md` with completed milestones, current milestone, verification results, accepted residual risks, deferred hardening and genuine blockers.
>
> Report only when Phase 1 is complete or a genuine stop condition occurs.

---

## Confirmed pre-code defects to fix in the documents first

From AUDIT-1 and AUDIT-3, all with located evidence:

| ID | Defect | Files |
| --- | --- | --- |
| CT-1 | Platform/client classification inferred from a `client_id` column; mis-classifies `client_hostnames`, `subscriptions`, `support_access_sessions`, leaving the client runtime role with DML on the hostname routing table | ADR-0002, plan §4.1/§4.2/§4.3/§11, setup §2.2 |
| CT-2 | No legal cross-client read path for the outbox poller, retention purge, usage aggregation or session sweep under a no-`BYPASSRLS` role model | ADR-0002, plan §4, §8.2 |
| CT-3 | `SET LOCAL` cannot take a bind parameter; use `SELECT set_config('app.client_id', $1, true)` with UUID validation | ADR-0002, plan §5.3 |
| CT-4 | `SECURITY DEFINER` accessors specified without `search_path` pinning, `REVOKE EXECUTE FROM PUBLIC`, `STABLE`, or narrow signatures | ADR-0002, plan §4.2 |
| HH-1 | "Trusted-proxy hop count" is not a real mechanism for `X-Forwarded-Host` | ADR-0001, plan §5.1, setup §4 |
| HH-2 | Reserved-name constraint on `clients.slug` while `client_hostnames` is the routing authority | ADR-0001, plan §4.2 |
| A2 | `MATCH FULL` makes optional client relations unrepresentable — revert to `MATCH SIMPLE` | ADR-0002, plan §4.2, matrix §7 |
| B4 | Partial unique indexes cannot back a foreign key; collides with the soft-delete convention | ADR-0002, plan §2.3/§4.2 |
| NEW-1 | Prisma extensions do not intercept nested writes | ADR-0002 |
| NEW-2 | `upsert` create branch bypasses client scoping | ADR-0002 |
| — | ADRs marked Accepted while their decisions are open; §10 subsections numbered 9.x; ADR-0003 points ordered 1,2,3,4,9,5,6,7,8; turbo task names do not match root scripts | all |

Plus: single-host decision must be written through ADR-0001, the plan and the setup guide, replacing the `lvh.me` and mkcert material.

---

## Open decision that still needs the owner

**DEC-008 — primary key type.** The one irreversible choice in the decisions document, currently presented with no alternatives. It must be rewritten with a real option set (`bigserial`, UUIDv4, UUIDv7, ULID, and "UUIDv7 primary key plus a separate public-facing opaque id"), stating whether generation is database-side (`uuidv7()`, PostgreSQL 18 only) or client-side, before the schema is created at Milestone C.

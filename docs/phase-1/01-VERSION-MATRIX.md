# ExcelEx Platform — Exact Version Matrix

**Status:** Proposed — requires approval before `pnpm install` is run
**Verified:** 16 August 2026
**Verification method:** upstream release pages and official version policies (see Evidence column). The npm registry metadata API was not reachable from the environment used to compile this matrix, so every version below must be re-confirmed by the procedure in §4 before it is written into a `package.json`.

> **Audit rule.** No version in this document is authoritative until the procedure in §5 is executed on the build machine and the resulting `pnpm-lock.yaml` is committed. This matrix defines *intent and constraint*; the lockfile defines *fact*.
>
> **Pins below are release *lines*.** `24.19.x`, `16.3.x` and similar describe the line to resolve; §5 resolves each to an exact version, and §6.1 requires that exact version — never a range — in `package.json`.

---

## 1. Runtime and toolchain

| Component | Proposed pin | Latest observed | Evidence / note | Confidence |
| --- | --- | --- | --- | --- |
| Node.js | `24.19.x` | 24.19.0 (LTS), 26.7.0 | Node 24 entered Maintenance LTS ~03 Aug 2026; Node 26 became Active LTS ~05 Aug 2026 (11 days old at time of writing). **See DEC-001 — requires approval.** | Medium |
| pnpm | `11.5.2` | 11.5.2 | pnpm releases page. Pinned via `packageManager` field + Corepack. | High |
| TypeScript | `6.0.3` | 6.0.3 | TS 6.0 is the bridge release: `strict` now defaults true, `module` defaults `esnext`, `target` defaults `es2025`, `baseUrl` deprecated. TS 7 (native/Go) has **no programmatic compiler API**, which `nest build` requires. **See DEC-002.** | High |
| Turborepo | `2.10.10` | 2.10.10 | Released ~14 Aug 2026. | High |
| Docker Engine | `≥ 27` | — | Local dependency orchestration only. | High |

## 2. Backend

| Component | Proposed pin | Latest observed | Evidence / note | Confidence |
| --- | --- | --- | --- | --- |
| NestJS (`@nestjs/*`) | `11.1.24` | 11.1.24 | v12 (full ESM, Standard Schema validation, Vitest-first, `class-validator` retired) is roadmapped for ~Q3 2026 and is **not yet released stable**. **See DEC-003 — this shapes the validation choice.** | High |
| PostgreSQL | `18.6` | 18.6 | PG 18 released 25 Sep 2025, EOL 14 Nov 2030. PG 17.11 is the conservative alternative. | High |
| Prisma (`prisma`, `@prisma/client`) | `7.9.1` | 7.9.1 stable; 8.0.0-rc.1 | 8.0 RC published ~07 Aug 2026 — do not adopt an RC for the system of record. **See DEC-004.** | High |
| Redis | `8.x` server | — | Redis 8 is AGPLv3. Valkey 8 is the BSD alternative if the licence is a commercial concern. **See DEC-009.** | Medium |
| BullMQ | `5.79.0` | 5.79.0 | Released ~18 Jun 2026. | High |
| Validation | `zod` (latest 4.x) | — | Chosen over `class-validator`/`class-transformer` so schemas are shared with Next.js and the codebase is aligned with the NestJS 12 Standard Schema direction. **See DEC-003.** | Medium |
| Password hashing | `@node-rs/argon2` | — | Argon2id. Prebuilt native binaries — avoids the node-gyp build that the `argon2` package requires in CI and in Alpine images. | Medium |
| Logging | `pino` + `nestjs-pino` | — | Structured JSON logs, redaction paths configured. | High |
| Health | `@nestjs/terminus` | — | `/healthz` liveness, `/readyz` readiness. | High |
| OpenAPI | `@nestjs/swagger` | — | Version tracks `@nestjs/*` line. | High |
| Object storage | `@aws-sdk/client-s3` v3 | — | Behind an internal `StorageService` port; S3-compatible (AWS S3, MinIO locally). | High |

## 3. Frontend

| Component | Proposed pin | Latest observed | Evidence / note | Confidence |
| --- | --- | --- | --- | --- |
| Next.js | `16.3.x` | 16.3 (03 Aug 2026) | Next.js 16 is the current LTS-designated major (released 21 Oct 2025); Turbopack is the stable default bundler. | High |
| React / React DOM | `19.2.7` | 19.2.7 | Must match the version Next.js 16.3 expects — resolve via the lockfile, do not force. | High |
| Tailwind CSS | `4.3.3` | 4.3.3 | v4 CSS-first configuration; no `tailwind.config.js` by default. | Medium |
| shadcn/ui | CLI-generated, vendored | — | Not a runtime dependency. Components are generated into `packages/ui` and version-controlled; upstream updates are applied deliberately. | High |

## 4. Testing, quality and CI

| Component | Proposed pin | Latest observed | Evidence / note | Confidence |
| --- | --- | --- | --- | --- |
| Vitest | `4.1.8` | 4.1.8 stable; 5.0.0-beta | Single test runner across api, web and packages. Do not adopt the v5 beta. | High |
| Playwright | `1.62.1` | 1.62.1 | E2E plus HTML-to-PDF rendering later (foundation §6.1). | High |
| Supertest | latest 7.x | — | API-level tests against a booted Nest application. | Medium |
| ESLint | latest 9.x flat config | — | Shared config in `packages/eslint-config`. | Medium |
| Prettier | latest 3.x | — | Formatting only; no lint-rule overlap. | High |

## 5. Verification procedure (run before writing any `package.json`)

Execute on the build machine, which has registry access:

```bash
# 1. Resolve every intended dependency against the live registry
for p in typescript @nestjs/core @nestjs/common @nestjs/config @nestjs/swagger \
         @nestjs/terminus next react react-dom prisma @prisma/client bullmq \
         ioredis tailwindcss vitest @playwright/test supertest turbo zod \
         pino nestjs-pino @node-rs/argon2 @aws-sdk/client-s3 helmet; do
  printf '%-28s %s\n' "$p" "$(npm view "$p" version)"
done | tee docs/phase-1/versions.resolved.txt

# 2. Record the toolchain actually in use
node --version; pnpm --version; docker --version   >> docs/phase-1/versions.resolved.txt
```

Then reconcile: any row where the live registry disagrees with §1–§4 above is an **audit finding**, not a silent update. Update this matrix, note the change, and only then install.

## 6. Pinning policy

1. `package.json` uses the **exact version resolved by §5** (e.g. `"next": "16.3.2"`), never a range — not `^`, not `~`. The lines in §1–§4 are inputs to that resolution, not the values committed.
2. `pnpm-lock.yaml` is committed and CI runs `pnpm install --frozen-lockfile`.
3. `packageManager` in the root `package.json` pins pnpm; Corepack enforces it.
4. `.nvmrc` and the `engines` field pin the Node line; CI uses the same file.
5. Upgrades happen in dedicated PRs that touch only dependency files, with the changelog delta summarised in the PR body.
6. `pnpm audit` runs in CI; a high or critical advisory fails the build.
7. Renovate/Dependabot may open PRs but must not auto-merge anything in `apps/api` or `packages/database`.

## 7. Known compatibility risks to prove during scaffolding

| Risk | Why it matters | How Phase 1 proves it |
| --- | --- | --- |
| TypeScript 6 + NestJS 11 decorator metadata | Nest DI depends on `emitDecoratorMetadata`; TS 6 deprecates options ahead of TS 7's removals | Scaffold step S3 builds the API and asserts DI resolves; if it fails, fall back to TypeScript `5.9.x` |
| TS 6 `strict: true` / `target: es2025` defaults | Changed defaults can silently alter emitted output across packages | Explicit `tsconfig.base.json` sets every relevant option rather than relying on defaults |
| Prisma 7 + Postgres RLS | Session-scoped `SET LOCAL` requires an interactive transaction and a non-owner role | Scaffold step S5 includes a failing-then-passing RLS proof test |
| Next.js 16 Turbopack + Tailwind 4 | Both are recent majors with a new configuration model | Scaffold step S4 produces a production `next build` in CI |
| pnpm workspace + Prisma client generation | Generated client must resolve from `packages/database` in every consumer | Scaffold step S5 verifies import from both `apps/api` entrypoints (`main.http.ts` and `main.worker.ts` — see DEC-006) |
| Prisma composite foreign keys + client extension | Client-aware composite FKs require `clientId` as a shared relation scalar, which interacts with the extension that injects `clientId` into `data` | Scaffold step S5 proves a nested `create` and `connect` across a composite relation before the pattern is applied schema-wide |

---

**Sources consulted (16 Aug 2026):** Node.js previous-releases page; nestjs/nest releases; nextjs.org/blog; facebook/react releases; prisma/prisma releases; tailwindlabs/tailwindcss releases; microsoft/TypeScript releases; vitest-dev/vitest releases; microsoft/playwright releases; vercel/turborepo releases; pnpm/pnpm releases; taskforcesh/bullmq releases; postgresql.org versioning policy.

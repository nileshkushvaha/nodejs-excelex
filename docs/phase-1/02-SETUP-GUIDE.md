# ExcelEx Platform — Exact Project Setup

**Target machine:** ExcelEx development machine (macOS)
**Repository root:** `~/Sites/nodejs/excelex-log`
**Revision:** 2 — aligned with implementation plan revision 2
**Status:** Ready to execute once the blocking items in `03-DECISIONS-REQUIRING-APPROVAL.md` are signed off

> This is the reproducible setup procedure. It assumes DEC-001 resolves to Node 24, DEC-002 to TypeScript 6, DEC-005 to Nginx-proxied same-origin, and DEC-009 to Redis. If any resolves differently, only §1, §2 and the version pins change.

---

## 0. Prerequisites

| Requirement | Check | Install if missing |
| --- | --- | --- |
| Node 24 LTS | `node --version` → `v24.19.x` | `fnm install 24.19.0 && fnm use 24.19.0` |
| Corepack | `corepack --version` | Ships with Node; `corepack enable` |
| pnpm 11 | `pnpm --version` → `11.x` | `corepack prepare pnpm@11.5.2 --activate` |
| Docker Desktop | `docker compose version` | docker.com |
| mkcert | `mkcert -version` | `brew install mkcert nss && mkcert -install` |
| Git | `git --version` | Xcode CLT |
| PostgreSQL client | `psql --version` | `brew install libpq` |

Allocate Docker at least 4 GB. mkcert is required, not optional: the session cookie uses the `__Host-` prefix, which browsers only accept over HTTPS, so local development runs behind TLS.

---

## 1. Repository initialisation

```bash
cd ~/Sites/nodejs/excelex-log

git init
printf '24.19.0\n' > .nvmrc          # exact, matching engines and CI
corepack enable
corepack prepare pnpm@11.5.2 --activate
```

Root `package.json` — the scripts here and the Turborepo tasks in `turbo.json` must stay in one-to-one correspondence, because CI invokes the turbo tasks and developers invoke the scripts:

```jsonc
{
  "name": "excelex-platform",
  "private": true,
  "packageManager": "pnpm@11.5.2",
  "engines": { "node": "24.19.0", "pnpm": ">=11.5.2" },
  "scripts": {
    "build":            "turbo run build",
    "dev":              "turbo run dev",
    "format:check":     "prettier --check .",
    "format":           "prettier --write .",
    "lint":             "turbo run lint",
    "typecheck":        "turbo run typecheck",
    "test:unit":        "turbo run test:unit",
    "test:integration": "turbo run test:integration",
    "test:security":    "turbo run test:security",
    "test:e2e":         "turbo run test:e2e",
    "check:rls":        "turbo run check:rls-coverage",
    "verify":           "pnpm format:check && pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:integration && pnpm test:security && pnpm check:rls",
    "db:generate":      "turbo run db:generate",
    "db:migrate":       "pnpm --filter @excelex/database migrate:dev",
    "db:seed":          "pnpm --filter @excelex/database seed",
    "infra:up":         "docker compose -f infrastructure/docker/docker-compose.yml up -d",
    "infra:down":       "docker compose -f infrastructure/docker/docker-compose.yml down",
    "infra:reset":      "docker compose -f infrastructure/docker/docker-compose.yml down -v && pnpm infra:up"
  }
}
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Then run the version verification from `01-VERSION-MATRIX.md` §5 and commit `versions.resolved.txt` **before** any dependency is added. The matrix states release *lines*; that procedure resolves each to the exact version that goes into `package.json`. Any disagreement with the matrix is an audit finding to record, not a silent update.

---

## 2. Local infrastructure

`infrastructure/docker/docker-compose.yml` brings up five services: `postgres`, `redis`, `minio`, `mailpit` and `nginx`.

### 2.1 TLS certificates

```bash
mkdir -p infrastructure/nginx/certs
mkcert -install
mkcert -cert-file infrastructure/nginx/certs/lvh.pem \
       -key-file  infrastructure/nginx/certs/lvh-key.pem \
       "lvh.me" "*.lvh.me"
```

`infrastructure/nginx/certs/` is gitignored. Nginx terminates TLS, sets `X-Forwarded-Host` and `X-Forwarded-Proto`, proxies `/api/v1` to the API on `:3001` and everything else to Next.js on `:3000`. This is the same configuration shape as production, which is the point: the trusted-proxy branch of client resolution and the `__Host-` cookie both execute locally.

### 2.2 Database roles

RLS only protects anything if the runtime role is neither owner nor superuser, and platform tables are outside RLS entirely — so they are revoked rather than granted.

```sql
-- infrastructure/docker/postgres/init/01-roles.sql
CREATE ROLE excelex_owner    LOGIN PASSWORD 'dev_owner_password';
CREATE ROLE excelex_app      LOGIN PASSWORD 'dev_app_password';
CREATE ROLE excelex_platform LOGIN PASSWORD 'dev_platform_password';
CREATE ROLE excelex_readonly LOGIN PASSWORD 'dev_readonly_password';

CREATE DATABASE excelex OWNER excelex_owner;

\connect excelex

GRANT CONNECT ON DATABASE excelex TO excelex_app, excelex_platform, excelex_readonly;
GRANT USAGE  ON SCHEMA public     TO excelex_app, excelex_platform, excelex_readonly;

ALTER DEFAULT PRIVILEGES FOR ROLE excelex_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO excelex_app, excelex_platform;
ALTER DEFAULT PRIVILEGES FOR ROLE excelex_owner IN SCHEMA public
  GRANT SELECT ON TABLES TO excelex_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE excelex_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO excelex_app, excelex_platform;
```

The blanket grant above is deliberately followed, in the migration that creates them, by explicit revokes — generated alongside the RLS policies so the two can never drift:

```sql
-- emitted per platform table by tools/generate-rls.ts
REVOKE ALL ON clients, subscriptions, plans, plan_limits,
              platform_users, platform_sessions, platform_user_mfa,
              platform_roles, platform_role_permissions, platform_user_roles,
              platform_audit_events, support_access_sessions
  FROM excelex_app;

-- audit tables are append-only for every runtime role
REVOKE UPDATE, DELETE ON audit_events, platform_audit_events
  FROM excelex_app, excelex_platform;
```

Without those revokes, `excelex_app` — the role every client request runs as — could read the full customer list and the platform administrators' Argon2id hashes, with no RLS policy in the way, because RLS by construction covers only tables that have a `client_id`.

### 2.3 Start and verify

```bash
pnpm infra:up
docker compose -f infrastructure/docker/docker-compose.yml ps   # all healthy

psql "postgresql://excelex_app:dev_app_password@localhost:5432/excelex" \
  -c "SELECT current_user, current_setting('is_superuser');"
# expect: excelex_app | off       ← if this says "on", RLS protects nothing
```

Repeat that last check in every environment. RLS silently does nothing for a superuser or a table owner, which is precisely the failure mode that looks like success.

MinIO console: `localhost:9001`. Mailpit: `localhost:8025`.

---

## 3. Hostnames

### 3.1 Default: `lvh.me` over HTTPS

`*.lvh.me` resolves to `127.0.0.1` from public DNS. No machine configuration is required.

| Purpose | URL |
| --- | --- |
| Public site | `https://lvh.me` |
| Platform admin | `https://admin.lvh.me` |
| Client (example) | `https://acme.lvh.me` |
| API (same-origin, via Nginx) | `https://acme.lvh.me/api/v1` |
| API direct (debug only, bypasses the proxy) | `http://localhost:3001/api/v1` |

Verify before starting:

```bash
ping -c 1 acme.lvh.me                       # expect 127.0.0.1
curl -sI https://acme.lvh.me/api/v1/healthz # expect 200 once S3 is complete
```

The direct `localhost:3001` route exists for debugging only. Authentication flows must be exercised through Nginx, because that is where `X-Forwarded-Host` is set and where the `__Host-` cookie is valid.

### 3.2 Offline fallback

`lvh.me` needs a DNS lookup. For offline work, add to `/etc/hosts`:

```text
127.0.0.1 excelex.local admin.excelex.local acme.excelex.local globex.excelex.local
```

Set `APP_BASE_DOMAIN=excelex.local`, regenerate the mkcert certificate for those names, and add each new development client by hand — `/etc/hosts` does not support wildcards, which is why this is the fallback rather than the default.

---

## 4. Environment configuration

`.env.example` is committed and complete; `.env` is gitignored. `packages/configuration` validates this surface with Zod at boot and refuses to start on anything missing or malformed. Staging and production read the same variables from the platform secret store, injected at container start — never from a file in the image.

```bash
# ---- Runtime
NODE_ENV=development
LOG_LEVEL=debug

# ---- Hostnames
APP_BASE_DOMAIN=lvh.me
APP_PUBLIC_URL=https://lvh.me
APP_PLATFORM_SUBDOMAIN=admin
APP_WEB_PORT=3000
APP_API_PORT=3001
TRUSTED_PROXY_HOPS=1

# ---- Database (distinct roles, distinct URLs — this separation is load-bearing)
DATABASE_URL=postgresql://excelex_app:dev_app_password@localhost:5432/excelex?schema=public
DATABASE_PLATFORM_URL=postgresql://excelex_platform:dev_platform_password@localhost:5432/excelex?schema=public
DATABASE_MIGRATION_URL=postgresql://excelex_owner:dev_owner_password@localhost:5432/excelex?schema=public
DATABASE_TRANSACTION_TIMEOUT_MS=15000

# ---- Redis
REDIS_URL=redis://localhost:6379
REDIS_KEY_PREFIX=excelex:dev

# ---- Sessions
SESSION_SECRET=                            # 32+ random bytes; generate, never commit
SESSION_COOKIE_NAME=__Host-excelex_session
SESSION_IDLE_TTL_MINUTES=60
SESSION_ABSOLUTE_TTL_HOURS=12

# ---- Storage (MinIO locally)
STORAGE_ENDPOINT=http://localhost:9000
STORAGE_BUCKET=excelex-dev
STORAGE_ACCESS_KEY=minioadmin
STORAGE_SECRET_KEY=minioadmin
STORAGE_FORCE_PATH_STYLE=true

# ---- Mail (Mailpit locally)
MAIL_HOST=localhost
MAIL_PORT=1025
MAIL_FROM="ExcelEx <no-reply@excelex.in>"

# ---- Security
ARGON2_MEMORY_KIB=19456
ARGON2_ITERATIONS=2
ARGON2_PARALLELISM=1
RATE_LIMIT_LOGIN_PER_MINUTE=5
RATE_LIMIT_GLOBAL_PER_MINUTE=600
IDEMPOTENCY_TTL_HOURS=24
```

Generate the session secret with `openssl rand -base64 48`. It goes in `.env`, never in the repository.

**Production boot assertions.** The process refuses to start when `NODE_ENV=production` and any of these hold: the session cookie name lacks the `__Host-` prefix; `DATABASE_URL` resolves to a superuser or the table owner; `SESSION_SECRET` is shorter than 32 bytes; `APP_BASE_DOMAIN` does not match the serving certificate. Each is a real incident that a startup check prevents for free.

---

## 5. Scaffold order

Follow the S-steps in `00-IMPLEMENTATION-PLAN.md` §12. Each ends in a reviewable commit with a proof that must pass before the next begins.

```text
S1  workspace, tooling, CI skeleton           → pnpm format:check lint typecheck
S2  docker infra incl. nginx + packages/configuration → criterion 2
S3  apps/api skeleton                          → criterion 8; TS 6 + Nest DI proven (DEC-002)
S4  apps/web skeleton                          → next build; host classification tested
S5  packages/database + RLS + privilege revokes → criterion 10; RLS and composite-FK proofs; latency benchmark
S6  client context boundary                    → criterion 4
S7  authentication (client + platform, MFA)    → criterion 6
S8  authorisation                              → permission tests
S9  platform administration, quotas            → criterion 5
S10 queues, job monitoring, outbox, storage, idempotency → job/outbox/idempotency tests
S11 security suite, Playwright, full CI        → criteria 1, 3, 7, 9, 11
S12 deployment: Dockerfiles, staging, migration job → staging deploys from main
S13 backup, PITR, restore drill, retention, runbooks → measured RTO recorded
```

**Do not** run `nest new` or `create-next-app` at the repository root. Both generate their own git repository, lockfile and tooling configuration, which then fights the workspace. Scaffold into a temporary directory and move only `src/` plus the framework config, or write the small number of files by hand — for a monorepo that is genuinely less work than undoing a generator.

---

## 6. Daily development loop

```bash
pnpm infra:up          # postgres, redis, minio, mailpit, nginx
pnpm db:migrate        # applied as the owner role
pnpm db:seed           # platform admin + two demo clients (acme, globex)
pnpm dev               # turbo runs web:3000 and api:3001 behind nginx:443
```

Then open `https://admin.lvh.me` for the platform console and `https://acme.lvh.me` for a client.

Before pushing:

```bash
pnpm verify            # format, lint, types, unit, integration, security, RLS coverage
```

`test:security` is the cross-client suite. A failure there is a stop-work item — it is the one signal that means the platform's core promise is broken.

---

## 7. Verifying the foundation

All eleven criteria are required checks for merge to `main`.

| # | Criterion | Command |
| --- | --- | --- |
| 1 | Monorepo builds and tests | `pnpm install --frozen-lockfile && pnpm turbo run format:check lint typecheck build test:unit test:integration` |
| 2 | Docker starts Postgres, Redis and the proxy | `pnpm infra:up && pnpm --filter @excelex/testing smoke:infra` |
| 3 | Next.js resolves a client subdomain | `pnpm test:e2e -- client-resolution` |
| 4 | NestJS resolves the same client | `pnpm --filter @excelex/api test:integration -- client-context` |
| 5 | Platform admin creates a client | `pnpm test:e2e -- platform-client-creation` |
| 6 | Client admin activates and signs in | `pnpm test:e2e -- client-activation` |
| 7 | Cross-client access rejected | `pnpm test:security` |
| 8 | Health checks and structured logging | `pnpm --filter @excelex/api test:integration -- health logging` |
| 9 | CI runs the full gate | `.github/workflows/ci.yml` on a pull request |
| 10 | RLS and privilege coverage | `pnpm check:rls` |
| 11 | No committed secrets | `gitleaks detect --no-git` |

Phase 1 is complete when all eleven pass on a **clean clone** with no manual steps beyond `pnpm install`, the mkcert step, and `pnpm infra:up`. The clean-clone condition matters: a foundation that only works on the machine it was built on is not a foundation.

---

## 8. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `acme.lvh.me` does not resolve | Offline, or DNS filtering blocks `lvh.me` | Use the `/etc/hosts` fallback in §3.2 and set `APP_BASE_DOMAIN` |
| Browser rejects the session cookie | `__Host-` requires HTTPS, `Path=/` and no `Domain` | Go through Nginx on `https://`, not `localhost:3001` |
| RLS tests pass when they should fail | Connected as owner or superuser | Re-run the `current_user` check in §2.3; confirm `FORCE ROW LEVEL SECURITY` is applied |
| A client request can read `clients` or `platform_users` | Platform-table revokes missing | Re-run the generated revoke migration; `pnpm check:rls` should have caught this |
| `MissingClientContextError` on a new endpoint | Route not client-scoped and not explicitly marked | Add the client scope, or `@PlatformRoute()` / `@PublicRoute()` if genuinely correct |
| Integration tests hang or time out | Test wrapped in a rollback transaction while the app opens its own interactive transaction — Prisma does not nest | Use truncation or template-database cloning for client-path tests |
| Transaction timeout errors under load | Prisma's five-second default now applies to every client-scoped request | Set `DATABASE_TRANSACTION_TIMEOUT_MS` explicitly; check pool sizing |
| Prisma client not found in `apps/api` | `db:generate` did not run | It is a Turborepo dependency of `build`/`typecheck`/tests; run `pnpm db:generate` and check `turbo.json` |
| Nest DI fails after a TypeScript bump | Decorator metadata emission changed | See DEC-002; fall back to TypeScript 5.9.x and record the finding |
| Port 5432 in use | A local PostgreSQL installation is running | `brew services stop postgresql` or remap the compose port |

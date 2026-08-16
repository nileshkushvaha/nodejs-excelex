# ADR-0001 — Client hostname contract and resolution

**Status:** Accepted (confirmed by project owner, 16 August 2026)
**Context:** Phase 1 — Engineering and SaaS foundation
**Supersedes:** nothing
**Related:** ADR-0002 (isolation), ADR-0003 (sessions), DEC-005 (API hostname), DEC-011 (custom domains)

---

## Context

ExcelEx is the platform owner; each courier company is an isolated client reached at a subdomain such as `company1.excelex.in` (foundation §3.1, §8.1). The baseline is explicit that the client identifier must come from a trusted hostname and authenticated session, never from anything the browser can set (foundation §8.2, reinforced by the project owner's standing engineering instructions — which should be committed to `docs/project-instructions.md` so that citations to them are auditable).

That makes the hostname a security boundary, not a routing convenience, and it needs three things pinned before any code exists: how a host maps to a client, which hosts are reserved, and how development reproduces the production path rather than approximating it.

The development-hostname question is the one that quietly determines whether the boundary is actually tested. If local development uses a header override or a single `localhost` origin, then the code path that resolves a client from a trusted hostname — the exact path an attacker would target — is never exercised until staging.

## Decision

**1. Hosts map to clients through a `client_hostnames` table, not through slug parsing.**

```text
client_hostnames
├── id            uuid (v7)
├── client_id     uuid → clients.id
├── hostname      text UNIQUE (lowercased, punycode-normalised)
├── is_primary    boolean
├── verified_at   timestamptz null
└── created_at    timestamptz
```

Resolution is a lookup, cached in Redis under `host:<hostname>` with explicit invalidation on client or hostname mutation.

**2. Host classification happens before anything else.** Every request is classified as `public`, `platform`, `client` or `rejected` by matching against the configured base domain and the reserved list. A host that matches no rule returns 404 — not 400, and not a fallback client.

**3. Reserved subdomains** cannot be registered as client slugs: `www`, `admin`, `api`, `app`, `static`, `assets`, `cdn`, `mail`, `smtp`, `ftp`, `status`, `docs`, `support`, `help`, `blog`, `dev`, `staging`, `test`, `internal`, `excelex`. Enforced by a database check constraint *and* service-layer validation.

**4. The host is read only from a trusted source.** Behind Nginx, from `X-Forwarded-Host` with a configured trusted-proxy hop count; directly, from the connection's `Host`. A `clientId` appearing in a request body, query string or client-set header is a validation error that writes a security audit event — in a correct client it never occurs, so its presence is signal.

**5. Development uses `*.lvh.me` behind the same Nginx configuration as production.** `lvh.me` and all its subdomains resolve to `127.0.0.1` from public DNS, so wildcard client hostnames work with zero machine configuration. The development stack includes Nginx with locally-trusted TLS (mkcert), because the resolution chain begins with a trusted proxy setting `X-Forwarded-Host` — running without it locally would mean the trusted-proxy branch, the hop-count configuration and the header-spoofing rejection are the exact code that never executes in development, which defeats the purpose of choosing `lvh.me` in the first place.

| Environment | Public | Platform | Client |
| --- | --- | --- | --- |
| Local | `lvh.me:3000` | `admin.lvh.me:3000` | `<slug>.lvh.me:3000` |
| Production | `www.excelex.in` | `admin.excelex.in` | `<slug>.excelex.in` |

The base domain is configuration (`APP_BASE_DOMAIN`), so no hostname is hard-coded anywhere.

## Alternatives considered

**`/etc/hosts` entries.** Fully offline and self-contained, but `/etc/hosts` does not support wildcards, so every new development or test client requires a `sudo` edit. That friction lands hardest on the cross-client test suite, which needs to create clients freely. Retained as a documented offline fallback.

**Header override in development.** Simplest to run — one `localhost` origin, client carried in `X-Client-Host`. Rejected because it means the trusted-hostname resolution path is not the path running locally, and that is the single path this ADR exists to protect. It also normalises the habit of reading client identity from a header, which is the exact anti-pattern the baseline forbids.

**Slug parsing instead of a hostname table.** Cheaper by one query, but it forecloses client custom domains (foundation §16 lists this as open) and makes hostname changes a migration rather than a row update. The table costs a cached lookup and keeps the option open at no design cost.

## Consequences

**Positive.** The production resolution path is the one exercised in development and in every test. Custom domains later require certificate provisioning and a verification flow, not a change to client resolution. Reserved-name hijacking is blocked at the database level.

**Negative.** `lvh.me` requires a DNS lookup, so fully offline development needs the `/etc/hosts` fallback, and the project takes a dependency on a third-party convenience domain remaining available — mitigated by the base domain being configuration and the fallback being documented. Hostname lookup adds a cache round trip to every request.

**Follow-up.** DEC-011 (whether custom domains are actually wanted) determines whether TLS automation belongs in Phase 1 infrastructure work.

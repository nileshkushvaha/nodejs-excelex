# ADR-0003 — Session and authentication boundary

**Status:** Accepted (confirmed by project owner, 16 August 2026)
**Context:** Phase 1 — Engineering and SaaS foundation
**Related:** ADR-0001 (hostname), ADR-0002 (isolation), DEC-005 (API hostname topology)

---

## Context

The platform serves four audiences across distinct hostnames: the public site (`www`), ExcelEx platform administrators (`admin`), client staff (`<slug>`), and client customers (`<slug>/portal`). The baseline requires secure HTTP-only session cookies, strict client and branch authorisation, optional MFA with enforcement for platform administrators, and session controls (foundation §13).

The decision that matters most is cookie scope, because it determines what a stolen or replayed session can reach. A cookie set on `.excelex.in` is transmitted to *every* client subdomain — which makes single sign-on pleasant and makes the client boundary partly a matter of server-side diligence. A cookie set on `acme.excelex.in` is transmitted only there, and the browser enforces the boundary for us.

## Decision

**1. Sessions are opaque server-side identifiers, not JWTs.** A row in `sessions` plus a Redis cache entry. Revocation is immediate and total — which matters when a client deactivates a staff member, when ExcelEx suspends a client for non-payment, or during incident response. A stateless JWT would require a denylist to achieve the same thing, at which point the statelessness has been spent for nothing.

**2. Cookies are scoped to the exact host, never to the parent domain.**

The cookie is named `__Host-excelex_session`. That prefix is not cosmetic: browsers *refuse* the cookie unless it is `Secure`, has `Path=/`, and carries **no** `Domain` attribute. The per-host scoping is therefore enforced by the browser rather than by our own correctness. The development stack runs Nginx with locally-trusted TLS (mkcert) so the same cookie name and the same proxy path are exercised locally; an unprefixed name exists only for the plain-HTTP fallback, and a production boot assertion refuses to start without the prefix.

Attributes: `HttpOnly`, `SameSite=Lax`, `Secure` everywhere except local HTTP.

**3. A session is bound to one client.** The `sessions` row carries `client_id` and `host`. Presenting a session issued for `acme` on `globex.excelex.in` is rejected and writes a security audit event. A user belonging to two clients signs in to each separately — an accepted usability cost, since it is uncommon for courier staff and the alternative weakens the boundary for everyone.

**4. Browser traffic is same-origin.** The API is served at `/api/v1` on each host rather than at `api.excelex.in`, proxied by Nginx (see DEC-005), so `Set-Cookie` originates from the client host itself.

Be precise about why, because the intuitive reason is wrong. `acme.excelex.in` and `api.excelex.in` are **same-site** — cookie "site" means the registrable domain, `excelex.in` — so they are merely cross-*origin*. `SameSite=Lax` would not block a request between them. What actually keeps the session on one host is that a `__Host-` cookie is **host-only**: with no `Domain` attribute, the browser sends it to `acme.excelex.in` and nowhere else.

The same fact has a consequence worth stating directly: **`SameSite` provides no protection between clients**, because every client subdomain shares a site. Host-only cookie scope is the only thing separating them, and CSRF must therefore be mitigated explicitly rather than assumed away — see point 9.

Same-origin is still the right topology: it avoids a parent-domain cookie, needs no per-client CORS origin allowlist, and keeps `api.excelex.in` free for later machine-to-machine customer APIs that will use bearer tokens and no cookies at all.

**9. CSRF is mitigated explicitly.** Every non-safe method (`POST`, `PUT`, `PATCH`, `DELETE`) is checked against an `Origin` / `Sec-Fetch-Site` allowlist in the Nest pipeline; a request whose origin is not the exact host it is addressed to is rejected and audited. This is roughly twenty lines and it is the correct mitigation given that all client hosts share a site. It is defence in depth alongside host-only cookies, not a substitute for them.

**5. Platform administrators are separate, down to the tables.** They authenticate on `admin.excelex.in` against `platform_users`, with sessions in `platform_sessions`, TOTP secrets and recovery codes in `platform_user_mfa`, and authorisation through `platform_roles` / `platform_role_permissions`. None of these are client-scoped, so none of them can live in the client-scoped `sessions`, `roles` or `permissions` tables — a distinction that is easy to overlook and that leaves platform authentication with nowhere to store its state if it is. MFA is mandatory. A platform session grants no client data access by itself; reaching client data requires an explicit, reason-stamped, time-boxed support-access session recorded in `support_access_sessions` and surfaced to the client.

**6. Credentials.** Argon2id via `@node-rs/argon2` (OWASP baseline: 19 MiB, 2 iterations, parallelism 1), tuned against the production host before launch. Prebuilt binaries avoid a node-gyp build in CI and in Alpine images.

**7. Activation by invitation only.** No self-service client signup in Phase 1, because plan assignment is a platform-owner action. Invitation tokens are 32 random bytes, stored **hashed**, single-use, 72-hour TTL. Legacy Xpresion password hashes are never imported (foundation §10.7) — migrated users receive an activation invitation.

**8. Session lifecycle.** Rotation on privilege change, idle expiry (default 60 minutes), absolute expiry (default 12 hours), device and IP recorded, and a concurrent-session listing that the later licensing model can build on (foundation §8.5). Rate limiting per IP and per account with progressive backoff, and authentication failures that do not reveal whether an account exists.

## Alternatives considered

**Shared parent-domain cookie (`.excelex.in`).** Single sign-on across all subdomains — smoother for ExcelEx support staff and for users belonging to multiple clients. Rejected because the cookie is then transmitted to every client host, including any client host that is later compromised or operated by a hostile party. In a platform whose core promise is that competing courier companies cannot see each other, sending every client's browser the same credential is the wrong default. It also makes client-scoped revocation a server-side bookkeeping exercise rather than a browser-enforced fact.

**JWT bearer tokens held by the frontend.** Portable to future mobile and PDA applications and to customer APIs. Rejected for browser sessions: revocation needs a denylist, and any token reachable by JavaScript is more XSS-exposed than an `HttpOnly` cookie. The future mobile and customer-API cases are genuinely different — those will use tokens on `api.excelex.in`, where there is no cookie and no browser to protect.

**A separate `api.excelex.in` for browser traffic.** One API hostname for everything. Because it is same-site with the client hosts, this does *not* require `SameSite=None` — but it does require the session cookie to carry `Domain=.excelex.in` so it reaches the API host, which is precisely the parent-domain cookie rejected above and is incompatible with the `__Host-` prefix. It also adds a per-client CORS origin allowlist with credentials enabled. Rejected on those grounds rather than on `SameSite` grounds.

## Consequences

**Positive.** A stolen session cookie is useless on any other client's host, and the browser — not our code — enforces that. Revocation is immediate. There is no parent-domain cookie and no CORS credentials surface. The machine-to-machine API arrives later with a clean, cookie-free authentication model.

**Negative.** Users belonging to multiple clients sign in per client. Browser requests take one proxy hop through the same-origin `/api` path. Session lookups add a Redis read per request, with a database fallback. Because all client hosts share a site, `SameSite` buys nothing between clients and the origin check in point 9 is load-bearing rather than decorative. The cookie name differs between local HTTP and production — handled by running Nginx with locally-trusted TLS in the development stack so `__Host-` semantics are exercised there too, with the unprefixed name reserved for the plain-HTTP fallback and refused outright in production.

**Follow-up.** Concurrent-session licensing (foundation §8.5) is deliberately not modelled in Phase 1; the `sessions` table carries enough data to add it without migration. MFA for client users is available but not enforced — enforcement policy per client is a Phase 2 configuration question.

---

## Addendum (19 August 2026) — password reset by mailed code

Implemented as three public endpoints under `/api/v1/auth/password-reset/{request,verify,complete}`. A six-digit code is generated only for an existing, active address, stored hashed with a per-row salt in `password_resets`, mailed through the client's transport (ADR-0004 §7), and accepted five times at most within ten minutes; the response to `request` is identical whether or not the address exists, and its timing is padded to match. A verified code is exchanged for a long random reset token (hashed, fifteen minutes, single use) so the code is never reused; `complete` applies the same `applyNewPassword` rules the profile screen uses (policy, reuse, history), revokes every session, clears any lockout — a person who has proved control of the mailbox is the account's owner — and mails a confirmation. Requests are throttled per address (always) and per email (under the client's `resetThrottleEnabled`). Every step is audited; attempts age out with the retention sweep after seven days.

## Addendum (19 August 2026) — logged-in users

Administrators holding `settings.session.manage` see every live session in the account at `/users/active` (`/api/v1/system/sessions`): person, device, address, signed-in time, last activity (derived from the sliding idle expiry) and hard expiry, with revoke for one session or for everything a person holds. Revocation follows the rules above — the row is kept, the cached actor is dropped so the very next request on that token is refused — and is audited with the administrator as actor.

# ExcelEx Glossary — Client vs Customer

**Status:** Binding. This file governs naming in the schema, the code, the API and the UI.
**Established:** 16 August 2026, when the isolation unit was renamed from *tenant* to *client*.

---

## Why this file exists

The platform has two different parties that everyday English calls a "client", and they sit at
different levels of the hierarchy. Confusing them is not a style problem — it is an authorization
problem. `clientId` and `customerId` in the same function signature, transposed, is a cross-client
data leak that no framework catches for you.

```text
ExcelEx  ─ the platform owner (us)
   └── Client       ─ a courier company that buys the platform      ← the isolation boundary
         └── Customer  ─ a business that ships parcels with that courier
               ├── Shipper    ─ the party goods are collected from
               └── Consignee  ─ the party goods are delivered to
```

---

## The two terms

### Client

A **courier company that has bought the ExcelEx platform**. ExcelEx Logistics is Client #1;
Globex Couriers would be Client #2.

This is **the unit of isolation**. Everything in the security design is about clients:

| Where | Form |
| --- | --- |
| Database column | `client_id uuid NOT NULL` on every client-scoped table |
| RLS session variable | `app.client_id` |
| RLS policy name | `client_isolation` |
| Prisma model | `Client`, field `clientId` |
| Runtime role | `excelex_app` — reaches client tables only |
| Hostname routing | `client_hostnames` resolves a host to exactly one client |
| Request context | `RequestContext.clientId`, sealed once, immutable |

A client owns branches, staff users, roles, customers, shipments, rates, manifests and invoices.
A client can never see another client's row — that is the property the whole database design exists
to guarantee, and `packages/database/scripts/verify-isolation.sh` proves it on every run.

### Customer

A **business or person who ships parcels with a client**. In the legacy Xpresion system this is the
`Customer Master`, `Customer Rate`, `Customer Payment` and `Customer Portal` family of screens
(baseline §4.9, §4.12, §4.13).

A customer belongs to **exactly one client** and is meaningless outside it. Acme Textiles as a
customer of ExcelEx Logistics and Acme Textiles as a customer of Globex Couriers are two unrelated
rows that must never be merged, deduplicated or joined.

| Where | Form |
| --- | --- |
| Database table | `customers`, with a mandatory `client_id` like every other client-scoped table |
| Prisma model | `Customer`, field `customerId` |
| Arrives in | Phase 2 (master data), not Phase 1 |

The **customer portal** is the interface a client's customers log into — to book shipments, track
parcels, download PODs and view invoices. It is *not* the interface a client logs into; that is the
operations interface.

---

## Rules

1. **`client_id` is never a customer.** A column named `client_id` always identifies the courier
   company. If you need the shipping business, the column is `customer_id`, and the row carries a
   `client_id` as well.
2. **Every customer row is client-scoped.** `customers` is a client-scoped table under RLS with a
   mandatory `client_id`. There is no global customer.
3. **Uniqueness never spans clients.** A customer code is unique within a client:
   `@@unique([clientId, code])`, never `@@unique([code])`.
4. **Never abbreviate either word.** No `cid`, no `custId`, no `cli`. In a codebase with both terms,
   a three-letter abbreviation is a defect waiting for a tired reviewer.
5. **"Client" in the isolation sense only.** Do not use "client" for an HTTP client, an API consumer
   or a Prisma client instance in domain code. Those are `httpClient`, `apiConsumer`,
   `prisma` / `PrismaService`. `PrismaClient` is a library type and keeps its name; a variable of a
   domain type never does.
6. **UI copy follows the same split.** Platform admin screens say "Client". A client's own operations
   screens say "Customer" for their shipping businesses. No screen uses both words for the same thing.

---

## Vocabulary mapping

The word **tenant** was replaced by **client** on 16 August 2026. Two document sets deliberately
keep the old word, because rewriting them would falsify a record:

| Document | Word used | Why it was not rewritten |
| --- | --- | --- |
| `ExcelEx-NodeJS-SaaS-Project-Foundation.md` | tenant | The approved baseline as received. It is an input, not a working document. |
| `audits/AUDIT-1`, `AUDIT-2`, `AUDIT-3` | tenant | Dated findings that quote earlier revisions by line number. Editing them would break their citations. |

Everywhere else — ADRs, the implementation plan, the setup guide, the schema, the SQL, the code —
the word is **client**. When reading the baseline or an audit, substitute:

| Baseline / audit term | Current term |
| --- | --- |
| tenant | client |
| tenant_id | client_id |
| multi-tenant isolation | multi-client isolation |
| tenant runtime role | client runtime role (`excelex_app`) |
| customer | customer (**unchanged** — it already meant the client's customer) |

One term is intentionally kept as-is: **multi-tenancy** remains acceptable when naming the
*architectural pattern* in prose ("a multi-tenant architecture"), because that is the industry term
for the pattern and renaming it would make the design unsearchable against the literature. It is
never used as a noun for a client.

---

## Related terms

| Term | Meaning |
| --- | --- |
| **Platform user** | ExcelEx staff. Lives in `platform_users`, has no `client_id`, authenticates on the admin host with mandatory MFA. |
| **User** | A client's staff member. Lives in `users` with a mandatory `client_id`. |
| **Portal user** | A customer's login to the customer portal. Phase 4. |
| **Branch** | An operational location belonging to one client. The unit of the branch authorization scope. |
| **Shipper** | The party a shipment is collected from. Often, but not always, the customer. |
| **Consignee** | The party a shipment is delivered to. |
| **Vendor / carrier** | An external delivery partner such as Blue Dart or Delhivery. Not a client, not a customer. |
| **Support access** | A time-boxed, audited, reason-carrying grant letting an ExcelEx platform user act inside one client. Recorded in `support_access_sessions`. |

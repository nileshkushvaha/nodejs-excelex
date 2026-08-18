# Migration

**Status:** Binding. Two different things are called migration here and they have different rules.

1. **Legacy → ExcelEx** — moving a courier's existing data in, once.
2. **Schema change** — changing a table that already holds data, repeatedly, for ever.

The second is the one that was asked about, and the honest answer starts with an admission.

---

## The rate tables were replaced. That will not be available again.

On 18 August the rate schema was thrown away and rebuilt, because the client's own rate file
showed the model was the wrong shape — typed slab lines, not a base and a step.

That was only allowed because **the tables were three hours old and had never held a row**. It is
not a precedent. From the moment a table holds data anybody depends on, the rules below apply
instead, and "start again" is not one of them.

The test is simple and worth stating so nobody has to judge it under pressure:

> Has this table ever held a row that someone outside this repository would miss?
> If yes, it is migrated. If no, it may be replaced — in a single commit that says so.

---

## Schema change, once data exists

### Additive change — the easy case

A new nullable column, a new table, a new index. Prisma generates it, the migration applies it,
nothing else happens. Existing rows keep working because nothing required them to change.

Make new columns nullable or give them a default. A `NOT NULL` column with no default cannot be
added to a table with rows, and discovering that in production is a bad afternoon.

### Shape change — the case that needs care

Splitting a column, changing its type, moving a field to another table, or replacing a model
outright. Never done by dropping and recreating. Four steps, in four separate deploys:

1. **Expand.** Add the new shape alongside the old. Both exist; nothing reads the new one yet.
2. **Backfill.** A migration that writes the old data into the new shape, in batches, and is safe
   to run twice. Anything that has to run once and exactly once will eventually run twice.
3. **Cut over.** Switch the code to read and write the new shape. The old columns are still there
   and still correct, so this deploy is reversible by reverting the code alone.
4. **Contract.** Only after the new shape has been in production and correct for long enough to
   trust, drop the old columns in a migration of their own.

The cost of steps 1 and 4 is exactly the ability to undo step 3 without losing anything. That is
what buys the right to change a live schema at all.

### The backfill goes in the migration

Not in a script somebody remembers to run. `packages/database/prisma/migrations/` is the record of
what happened to the database, and a data change that is not in it did not happen as far as the
next environment is concerned.

```sql
-- Example: moving a customer's contract head to a real reference.
-- Batched, and safe to run twice: rows already matched are skipped.
UPDATE customers c
   SET contract_head_id = g.id
  FROM account_groups g
 WHERE g.client_id = c.client_id
   AND upper(g.name) = upper(c.contract_head)
   AND c.contract_head_id IS NULL;
```

### What protects it

- `pnpm run db:check-drift` — the schema and the migrations must agree. A difference means the
  next deploy applies something nobody reviewed.
- `verify-isolation.sh` — every client-scoped table must be under RLS. A new table without a
  policy is a cross-client leak, and this is the only thing that catches it.
- The route snapshot — an API change that moves an endpoint has to say so.

All three run in CI, which is why CI exists.

---

## Legacy → ExcelEx, once per client

The import engine is the migration tool. There is no separate one, deliberately: a migration path
that is only used once is a migration path nobody has tested.

### Order matters, because references do

Import in dependency order. Each step's rows are referenced by the next, and a reference that does
not resolve fails the row rather than creating a silent orphan.

| # | Master | Depends on |
| --- | --- | --- |
| 1 | Zones, product types, product groups, lookups | nothing |
| 2 | Destinations | zones |
| 3 | Service centres | destinations |
| 4 | Pin codes | destinations, zones |
| 5 | Products | product types, groups |
| 6 | Charges, account groups | nothing |
| 7 | Sales executives, departments, designations | nothing |
| 8 | Customers | service centres, destinations, branches, sales executives |
| 9 | Consignees, shippers | destinations, service centres |
| 10 | Rates | customers, products, destinations, zones |

### Every file is previewed first

Preview writes nothing and reports, per row, what would change. A commit with any failing row
writes nothing at all — the master is never left half-applied, because a half-applied master
cannot be reasoned about afterwards.

### Reconciliation is part of the migration, not a follow-up

For each master, three numbers must agree before moving to the next step:

- rows in the legacy export,
- rows the preview says it will create or update,
- rows in the table afterwards.

A difference is a rejected row, and the preview names the row and the reason. Chasing it now costs
minutes; finding it after go-live means a customer whose shipments cannot be priced.

### What does not come across, and is not supposed to

- **Portal passwords.** The customer import reads `Customer_user` and `Customer_password` and
  refuses them, in writing, in the preview. A portal login is a user account with a hashed
  credential, not a column on a customer row.
- **Internal identifiers.** Legacy row ids mean nothing here. Codes are the join, which is why
  every import matches on code.
- **Soft-deleted rows.** A customer deleted in the old system stays deleted; migrating it would
  resurrect a decision somebody made.

---

## When the shape is still being learned

This project has changed its mind twice about a model after seeing the client's real data — once
about customer status values, once about the whole rate schema. That will happen again, and the
right response is not to slow down guessing but to shorten the distance between guessing and
finding out:

- Ask for the real export **before** designing the table, not after.
- Build the import against their file, not against the schema, and let the file win.
- Keep the window in which a table can still be replaced as short as possible — which means
  getting real data in early, not late.

A model corrected in week one is a rewrite. The same model corrected in month six is a migration
with a backfill, a cutover and a rollback plan. The difference is entirely how early the real data
arrived.

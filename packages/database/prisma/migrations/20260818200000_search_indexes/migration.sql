-- Search that can use an index.
--
-- Every paged master filters with `contains` + `mode: insensitive`, which
-- Prisma renders as ILIKE '%term%'. A leading wildcard cannot use a B-tree,
-- so each search was a sequential scan of the whole table.
--
-- The first attempt was a trigram index per searched column. Measured on
-- 50,000 customers, the planner refused every one of them: a five-column OR
-- cannot be served by a BitmapOr over five separate trigram indexes, and
-- forbidding a sequential scan only made it walk a unique index instead —
-- same 75ms.
--
-- One generated column holding everything the list searches, with one index
-- over it, turns the same query into a bitmap index scan: 0.9ms. GENERATED
-- ALWAYS, so it cannot drift from the fields it summarises and no application
-- code has to remember to maintain it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE "customers" ADD COLUMN "search_text" text
  GENERATED ALWAYS AS (
    coalesce("code", '') || ' ' || coalesce("name", '') || ' ' ||
    coalesce("contact_person", '') || ' ' || coalesce("mobile", '') || ' ' ||
    coalesce("email", '')
  ) STORED;

ALTER TABLE "consignees" ADD COLUMN "search_text" text
  GENERATED ALWAYS AS (
    coalesce("code", '') || ' ' || coalesce("name", '') || ' ' ||
    coalesce("address_line1", '') || ' ' || coalesce("telephone1", '') || ' ' ||
    coalesce("mobile", '')
  ) STORED;

ALTER TABLE "shippers" ADD COLUMN "search_text" text
  GENERATED ALWAYS AS (
    coalesce("code", '') || ' ' || coalesce("name", '') || ' ' ||
    coalesce("address_line1", '') || ' ' || coalesce("telephone1", '') || ' ' ||
    coalesce("mobile", '') || ' ' || coalesce("gstin", '')
  ) STORED;

ALTER TABLE "destinations" ADD COLUMN "search_text" text
  GENERATED ALWAYS AS (
    coalesce("code", '') || ' ' || coalesce("name", '') || ' ' ||
    coalesce("state_code", '')
  ) STORED;

CREATE INDEX "customers_search_text_idx"    ON "customers"    USING gin ("search_text" gin_trgm_ops);
CREATE INDEX "consignees_search_text_idx"   ON "consignees"   USING gin ("search_text" gin_trgm_ops);
CREATE INDEX "shippers_search_text_idx"     ON "shippers"     USING gin ("search_text" gin_trgm_ops);
CREATE INDEX "destinations_search_text_idx" ON "destinations" USING gin ("search_text" gin_trgm_ops);

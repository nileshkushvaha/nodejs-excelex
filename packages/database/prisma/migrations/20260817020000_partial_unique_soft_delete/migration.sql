-- Soft-deleted rows must not squat their own unique values.
--
-- The convention is `deleted_at` rather than a hard delete, but a plain unique
-- constraint counts deleted rows: delete a role named "Hub Supervisor" and the
-- name can never be used again, with an error that reads like a duplicate
-- rather than like a tombstone. The implementation plan calls for partial unique
-- indexes for exactly this; they were specified and never built.
--
-- These are safe to make partial because none of them backs a foreign key. The
-- composite (client_id, id) uniques do back the client-aware FKs and are left
-- unconditional — a partial index cannot be an FK target.

DROP INDEX "branches_client_id_code_key";
CREATE UNIQUE INDEX "branches_client_id_code_key"
  ON "branches" ("client_id", "code") WHERE "deleted_at" IS NULL;
CREATE INDEX "branches_client_id_code_idx" ON "branches" ("client_id", "code");

DROP INDEX "users_client_id_email_key";
CREATE UNIQUE INDEX "users_client_id_email_key"
  ON "users" ("client_id", "email") WHERE "deleted_at" IS NULL;
CREATE INDEX "users_client_id_email_idx" ON "users" ("client_id", "email");

DROP INDEX "roles_client_id_name_key";
CREATE UNIQUE INDEX "roles_client_id_name_key"
  ON "roles" ("client_id", "name") WHERE "deleted_at" IS NULL;
CREATE INDEX "roles_client_id_name_idx" ON "roles" ("client_id", "name");

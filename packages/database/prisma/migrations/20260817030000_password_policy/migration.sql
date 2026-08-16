
-- CreateTable
CREATE TABLE "password_policies" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "min_length" INTEGER NOT NULL DEFAULT 8,
    "require_uppercase" BOOLEAN NOT NULL DEFAULT false,
    "require_lowercase" BOOLEAN NOT NULL DEFAULT false,
    "require_number" BOOLEAN NOT NULL DEFAULT false,
    "require_special" BOOLEAN NOT NULL DEFAULT false,
    "prevent_reuse" BOOLEAN NOT NULL DEFAULT true,
    "history_count" INTEGER NOT NULL DEFAULT 5,
    "expiry_enabled" BOOLEAN NOT NULL DEFAULT false,
    "expiry_days" INTEGER NOT NULL DEFAULT 90,
    "force_change_on_first_login" BOOLEAN NOT NULL DEFAULT false,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_history" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_policies_client_id_key" ON "password_policies"("client_id");

-- CreateIndex
CREATE INDEX "password_history_client_id_user_id_created_at_idx" ON "password_history"("client_id", "user_id", "created_at");

-- AddForeignKey
ALTER TABLE "password_history" ADD CONSTRAINT "password_history_client_id_user_id_fkey" FOREIGN KEY ("client_id", "user_id") REFERENCES "users"("client_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Bounds enforced in the database as well as the service. A policy row is
-- edited by an administrator through an API, but it is also exactly the kind of
-- row someone eventually fixes by hand in a console at 2am.
ALTER TABLE "password_policies" ADD CONSTRAINT "password_policies_sane_bounds" CHECK (
  "min_length" BETWEEN 6 AND 128
  AND "history_count" BETWEEN 1 AND 24
  AND "expiry_days" BETWEEN 1 AND 3650
);

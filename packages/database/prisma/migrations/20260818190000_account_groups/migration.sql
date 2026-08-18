-- CreateTable
CREATE TABLE "account_groups" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "account_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "account_groups_client_id_code_idx" ON "account_groups"("client_id", "code");

-- CreateIndex
CREATE INDEX "account_groups_client_id_parent_id_idx" ON "account_groups"("client_id", "parent_id");

-- CreateIndex
CREATE INDEX "account_groups_client_id_idx" ON "account_groups"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_groups_client_id_id_key" ON "account_groups"("client_id", "id");

-- AddForeignKey
ALTER TABLE "account_groups" ADD CONSTRAINT "account_groups_client_id_parent_id_fkey" FOREIGN KEY ("client_id", "parent_id") REFERENCES "account_groups"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Soft-deleted rows must not squat their codes.
CREATE UNIQUE INDEX "account_groups_client_id_code_key"
  ON "account_groups" ("client_id", "code") WHERE "deleted_at" IS NULL;

-- The one cycle a single row can make. Longer cycles need a walk, which the
-- service does; this catches the common typo at no cost.
ALTER TABLE "account_groups"
  ADD CONSTRAINT "account_groups_not_own_parent_check" CHECK ("parent_id" IS DISTINCT FROM "id");

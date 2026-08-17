
-- CreateEnum
CREATE TYPE "DestinationKind" AS ENUM ('DOMESTIC', 'INTERNATIONAL');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('REGULAR', 'METRO', 'REMOTE');

-- CreateTable
CREATE TABLE "destinations" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "kind" "DestinationKind" NOT NULL DEFAULT 'DOMESTIC',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "mobile" TEXT,
    "country_code" TEXT NOT NULL DEFAULT 'IN',
    "state_code" TEXT,
    "zone_id" UUID,
    "service_type" "ServiceType" NOT NULL DEFAULT 'REGULAR',
    "main_branch_id" UUID,
    "manifest_branch_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "destinations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "destinations_client_id_code_idx" ON "destinations"("client_id", "code");

-- CreateIndex
CREATE INDEX "destinations_client_id_name_idx" ON "destinations"("client_id", "name");

-- CreateIndex
CREATE INDEX "destinations_client_id_kind_is_active_idx" ON "destinations"("client_id", "kind", "is_active");

-- CreateIndex
CREATE INDEX "destinations_client_id_state_code_idx" ON "destinations"("client_id", "state_code");

-- CreateIndex
CREATE UNIQUE INDEX "destinations_client_id_id_key" ON "destinations"("client_id", "id");

-- AddForeignKey
ALTER TABLE "destinations" ADD CONSTRAINT "destinations_client_id_zone_id_fkey" FOREIGN KEY ("client_id", "zone_id") REFERENCES "zones"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "destinations" ADD CONSTRAINT "destinations_client_id_main_branch_id_fkey" FOREIGN KEY ("client_id", "main_branch_id") REFERENCES "destinations"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "destinations" ADD CONSTRAINT "destinations_client_id_manifest_branch_id_fkey" FOREIGN KEY ("client_id", "manifest_branch_id") REFERENCES "destinations"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


CREATE UNIQUE INDEX "destinations_client_id_code_key"
  ON "destinations" ("client_id", "code") WHERE "deleted_at" IS NULL;

-- A destination cannot be its own servicing or manifest branch. Cheap to state
-- here, and it closes the shortest path to a self-referential loop; deeper
-- cycles are a service-layer concern.
ALTER TABLE "destinations" ADD CONSTRAINT "destinations_not_self_branch"
  CHECK ("main_branch_id" IS DISTINCT FROM "id" AND "manifest_branch_id" IS DISTINCT FROM "id");

-- Case-insensitive search on name and code, which is what the list filters do.
-- Without these, every keystroke in the column filter is a sequential scan over
-- the whole master.
CREATE INDEX "destinations_client_id_code_lower_idx"
  ON "destinations" ("client_id", lower("code") text_pattern_ops);
CREATE INDEX "destinations_client_id_name_lower_idx"
  ON "destinations" ("client_id", lower("name") text_pattern_ops);

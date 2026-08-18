-- CreateEnum
CREATE TYPE "LookupKind" AS ENUM ('VENDOR', 'INDUSTRY', 'AREA', 'CONTENT_TYPE', 'INSTRUCTION', 'CUSTOMER_GROUP');

-- CreateTable
CREATE TABLE "lookups" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "kind" "LookupKind" NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "lookups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pin_codes" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "city" TEXT,
    "area" TEXT,
    "state_code" TEXT,
    "country_code" TEXT NOT NULL DEFAULT 'IN',
    "destination_id" UUID,
    "zone_id" UUID,
    "oda" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pin_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lookups_client_id_kind_code_idx" ON "lookups"("client_id", "kind", "code");

-- CreateIndex
CREATE INDEX "lookups_client_id_kind_idx" ON "lookups"("client_id", "kind");

-- CreateIndex
CREATE INDEX "lookups_client_id_idx" ON "lookups"("client_id");

-- CreateIndex
CREATE INDEX "pin_codes_client_id_code_idx" ON "pin_codes"("client_id", "code");

-- CreateIndex
CREATE INDEX "pin_codes_client_id_destination_id_idx" ON "pin_codes"("client_id", "destination_id");

-- CreateIndex
CREATE INDEX "pin_codes_client_id_idx" ON "pin_codes"("client_id");

-- AddForeignKey
ALTER TABLE "pin_codes" ADD CONSTRAINT "pin_codes_client_id_destination_id_fkey" FOREIGN KEY ("client_id", "destination_id") REFERENCES "destinations"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pin_codes" ADD CONSTRAINT "pin_codes_client_id_zone_id_fkey" FOREIGN KEY ("client_id", "zone_id") REFERENCES "zones"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Soft-deleted rows must not squat their codes. Scoped by kind, so a vendor
-- and an industry may share one.
CREATE UNIQUE INDEX "lookups_client_id_kind_code_key"
  ON "lookups" ("client_id", "kind", "code") WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "pin_codes_client_id_code_key"
  ON "pin_codes" ("client_id", "code") WHERE "deleted_at" IS NULL;

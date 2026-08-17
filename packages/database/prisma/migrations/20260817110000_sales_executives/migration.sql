
-- CreateTable
CREATE TABLE "sales_executives" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "commission_percent" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "email" TEXT,
    "mobile" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sales_executives_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_executives_client_id_code_idx" ON "sales_executives"("client_id", "code");

-- CreateIndex
CREATE INDEX "sales_executives_client_id_name_idx" ON "sales_executives"("client_id", "name");

-- CreateIndex
CREATE INDEX "sales_executives_client_id_idx" ON "sales_executives"("client_id");


CREATE UNIQUE INDEX "sales_executives_client_id_code_key"
  ON "sales_executives" ("client_id", "code") WHERE "deleted_at" IS NULL;

-- A commission is a share of a sale, so it cannot exceed the sale or be
-- negative. Stated here as well as in the service, because this is the kind of
-- field an import writes in bulk without a human reading each row.
ALTER TABLE "sales_executives" ADD CONSTRAINT "sales_executives_commission_range"
  CHECK ("commission_percent" >= 0 AND "commission_percent" <= 100);

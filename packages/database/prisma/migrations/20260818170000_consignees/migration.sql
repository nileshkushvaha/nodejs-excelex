-- CreateTable
CREATE TABLE "consignees" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "destination_id" UUID,
    "service_centre_id" UUID,
    "contact_person" TEXT,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "pin_code" TEXT,
    "city" TEXT,
    "state_code" TEXT,
    "country_code" TEXT NOT NULL DEFAULT 'IN',
    "telephone1" TEXT,
    "telephone2" TEXT,
    "fax" TEXT,
    "email" TEXT,
    "mobile" TEXT,
    "industry" TEXT,
    "eori" TEXT,
    "vat" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "consignees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consignees_client_id_code_idx" ON "consignees"("client_id", "code");

-- CreateIndex
CREATE INDEX "consignees_client_id_name_idx" ON "consignees"("client_id", "name");

-- CreateIndex
CREATE INDEX "consignees_client_id_destination_id_idx" ON "consignees"("client_id", "destination_id");

-- CreateIndex
CREATE INDEX "consignees_client_id_idx" ON "consignees"("client_id");

-- AddForeignKey
ALTER TABLE "consignees" ADD CONSTRAINT "consignees_client_id_destination_id_fkey" FOREIGN KEY ("client_id", "destination_id") REFERENCES "destinations"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consignees" ADD CONSTRAINT "consignees_client_id_service_centre_id_fkey" FOREIGN KEY ("client_id", "service_centre_id") REFERENCES "service_centres"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Soft-deleted rows must not squat their codes.
CREATE UNIQUE INDEX "consignees_client_id_code_key"
  ON "consignees" ("client_id", "code") WHERE "deleted_at" IS NULL;

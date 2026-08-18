-- CreateTable
CREATE TABLE "shippers" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "origin_id" UUID,
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
    "gstin" TEXT,
    "aadhaar" TEXT,
    "pan" TEXT,
    "iec_no" TEXT,
    "bank_ad_code" TEXT,
    "bank_account" TEXT,
    "bank_ifsc" TEXT,
    "firm" "FirmType",
    "lut_number" TEXT,
    "lut_issue_date" DATE,
    "lut_till_date" DATE,
    "nfei" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "shippers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shippers_client_id_code_idx" ON "shippers"("client_id", "code");

-- CreateIndex
CREATE INDEX "shippers_client_id_name_idx" ON "shippers"("client_id", "name");

-- CreateIndex
CREATE INDEX "shippers_client_id_origin_id_idx" ON "shippers"("client_id", "origin_id");

-- CreateIndex
CREATE INDEX "shippers_client_id_idx" ON "shippers"("client_id");

-- AddForeignKey
ALTER TABLE "shippers" ADD CONSTRAINT "shippers_client_id_origin_id_fkey" FOREIGN KEY ("client_id", "origin_id") REFERENCES "destinations"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shippers" ADD CONSTRAINT "shippers_client_id_service_centre_id_fkey" FOREIGN KEY ("client_id", "service_centre_id") REFERENCES "service_centres"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Soft-deleted rows must not squat their codes.
CREATE UNIQUE INDEX "shippers_client_id_code_key"
  ON "shippers" ("client_id", "code") WHERE "deleted_at" IS NULL;

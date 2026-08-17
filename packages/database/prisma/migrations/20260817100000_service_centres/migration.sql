
-- CreateTable
CREATE TABLE "service_centres" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sub_name" TEXT,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "address_line3" TEXT,
    "address_line4" TEXT,
    "pin_code" TEXT,
    "country_code" TEXT NOT NULL DEFAULT 'IN',
    "state_code" TEXT,
    "destination_id" UUID,
    "telephone" TEXT,
    "email" TEXT,
    "gstin" TEXT,
    "gst_telephone" TEXT,
    "pan" TEXT,
    "icn_no" TEXT,
    "st_no" TEXT,
    "company_logo_key" TEXT,
    "signatory_logo_key" TEXT,
    "terms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bank_name" TEXT,
    "bank_account_no" TEXT,
    "bank_account_name" TEXT,
    "bank_address" TEXT,
    "ifsc" TEXT,
    "micr" TEXT,
    "invoice_prefix" TEXT,
    "invoice_last_no" INTEGER NOT NULL DEFAULT 0,
    "invoice_suffix" TEXT,
    "free_form_prefix" TEXT,
    "free_form_last_no" INTEGER NOT NULL DEFAULT 0,
    "free_form_suffix" TEXT,
    "debit_note_prefix" TEXT,
    "debit_note_last_no" INTEGER NOT NULL DEFAULT 0,
    "debit_note_suffix" TEXT,
    "credit_note_prefix" TEXT,
    "credit_note_last_no" INTEGER NOT NULL DEFAULT 0,
    "credit_note_suffix" TEXT,
    "receipt_last_no" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "service_centres_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_centres_client_id_code_idx" ON "service_centres"("client_id", "code");

-- CreateIndex
CREATE INDEX "service_centres_client_id_name_idx" ON "service_centres"("client_id", "name");

-- CreateIndex
CREATE INDEX "service_centres_client_id_idx" ON "service_centres"("client_id");

-- AddForeignKey
ALTER TABLE "service_centres" ADD CONSTRAINT "service_centres_client_id_destination_id_fkey" FOREIGN KEY ("client_id", "destination_id") REFERENCES "destinations"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


CREATE UNIQUE INDEX "service_centres_client_id_code_key"
  ON "service_centres" ("client_id", "code") WHERE "deleted_at" IS NULL;

-- Statutory identifiers, same shapes as the client's own registrations.
ALTER TABLE "service_centres" ADD CONSTRAINT "service_centres_gstin_shape"
  CHECK ("gstin" IS NULL OR "gstin" ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$');

ALTER TABLE "service_centres" ADD CONSTRAINT "service_centres_pan_shape"
  CHECK ("pan" IS NULL OR "pan" ~ '^[A-Z]{5}[0-9]{4}[A-Z]$');

ALTER TABLE "service_centres" ADD CONSTRAINT "service_centres_ifsc_shape"
  CHECK ("ifsc" IS NULL OR "ifsc" ~ '^[A-Z]{4}0[A-Z0-9]{6}$');

-- Ten lines of print, no more. Without the bound an import could write a
-- thousand and every invoice template downstream would have to defend itself.
ALTER TABLE "service_centres" ADD CONSTRAINT "service_centres_terms_bound"
  CHECK (array_length("terms", 1) IS NULL OR array_length("terms", 1) <= 10);

-- A counter records what has been issued; it cannot run backwards past zero.
ALTER TABLE "service_centres" ADD CONSTRAINT "service_centres_counters_non_negative"
  CHECK ("invoice_last_no" >= 0 AND "free_form_last_no" >= 0 AND "debit_note_last_no" >= 0
     AND "credit_note_last_no" >= 0 AND "receipt_last_no" >= 0);

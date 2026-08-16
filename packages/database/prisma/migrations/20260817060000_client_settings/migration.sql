
-- CreateTable
CREATE TABLE "client_settings" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "legal_name" TEXT NOT NULL,
    "trading_name" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "cin" TEXT,
    "support_email" TEXT,
    "support_phone" TEXT,
    "website_url" TEXT,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "state_code" TEXT,
    "country_code" TEXT NOT NULL DEFAULT 'IN',
    "postal_code" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "date_format" TEXT NOT NULL DEFAULT 'dd/MM/yyyy',
    "week_start" INTEGER NOT NULL DEFAULT 1,
    "invoice_prefix" TEXT,
    "invoice_footer" TEXT,
    "terms_text" TEXT,
    "logo_key" TEXT,
    "logo_dark_key" TEXT,
    "favicon_key" TEXT,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_settings_client_id_key" ON "client_settings"("client_id");


-- Statutory identifiers have fixed, checkable shapes. Enforced here as well as
-- in the service, because these are exactly the fields someone eventually fixes
-- by hand in a console — and a malformed GSTIN produces a tax document that is
-- rejected rather than merely untidy.
ALTER TABLE "client_settings" ADD CONSTRAINT "client_settings_gstin_shape"
  CHECK ("gstin" IS NULL OR "gstin" ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$');

ALTER TABLE "client_settings" ADD CONSTRAINT "client_settings_pan_shape"
  CHECK ("pan" IS NULL OR "pan" ~ '^[A-Z]{5}[0-9]{4}[A-Z]$');

ALTER TABLE "client_settings" ADD CONSTRAINT "client_settings_cin_shape"
  CHECK ("cin" IS NULL OR "cin" ~ '^[LUu][0-9]{5}[A-Za-z]{2}[0-9]{4}[A-Za-z]{3}[0-9]{6}$');

ALTER TABLE "client_settings" ADD CONSTRAINT "client_settings_week_start"
  CHECK ("week_start" BETWEEN 1 AND 7);

ALTER TABLE "client_settings" ADD CONSTRAINT "client_settings_country_shape"
  CHECK ("country_code" ~ '^[A-Z]{2}$');

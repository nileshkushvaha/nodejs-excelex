-- CreateEnum
CREATE TYPE "CustomerPaymentType" AS ENUM ('CREDIT', 'CASH', 'TOPAY');

-- CreateEnum
CREATE TYPE "CustomerRegisterType" AS ENUM ('REGISTERED', 'UNREGISTERED', 'COMPOSITION', 'SEZ');

-- CreateEnum
CREATE TYPE "MeasurementUnit" AS ENUM ('CENTIMETER', 'INCH');

-- CreateEnum
CREATE TYPE "IncentiveType" AS ENUM ('PERCENTAGE', 'FLAT', 'NONE');

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
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
    "billing_state_code" TEXT,
    "service_centre_id" UUID,
    "origin_id" UUID,
    "branch_id" UUID,
    "start_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gstin" TEXT,
    "aadhaar" TEXT,
    "aadhaar_dob" DATE,
    "passport_no" TEXT,
    "pan" TEXT,
    "tan" TEXT,
    "invoice_format" TEXT,
    "customer_type" TEXT NOT NULL DEFAULT 'CUSTOMER',
    "register_type" "CustomerRegisterType" NOT NULL DEFAULT 'REGISTERED',
    "logo_path" TEXT,
    "signature_path" TEXT,
    "payment_type" "CustomerPaymentType" NOT NULL DEFAULT 'CREDIT',
    "billing_type" TEXT,
    "contract_amount" DECIMAL(14,2),
    "credit_days" INTEGER NOT NULL DEFAULT 0,
    "registration_no" TEXT,
    "instructions" TEXT,
    "round_rupee" DECIMAL(12,2),
    "round_paisa" DECIMAL(12,2),
    "contract_head" TEXT,
    "ledger_head" TEXT,
    "contract_origin" TEXT,
    "business_channel" TEXT,
    "iec_no" TEXT,
    "bank_ad_code" TEXT,
    "bank_account" TEXT,
    "bank_ifsc" TEXT,
    "firm" TEXT,
    "shipper_type" TEXT,
    "lut_number" TEXT,
    "lut_issue_date" DATE,
    "lut_till_date" DATE,
    "nfei" BOOLEAN NOT NULL DEFAULT false,
    "fuel_surcharge" BOOLEAN NOT NULL DEFAULT true,
    "tax_applicable" BOOLEAN NOT NULL DEFAULT true,
    "no_tariff" BOOLEAN NOT NULL DEFAULT false,
    "inclusive_tax" BOOLEAN NOT NULL DEFAULT false,
    "sales_executive_id" UUID,
    "incentive_type" "IncentiveType" NOT NULL DEFAULT 'NONE',
    "incentive_percent" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "customer_message" TEXT,
    "account_email" TEXT,
    "best_rate" TEXT,
    "monthly_sales" DECIMAL(14,2),
    "default_vendor" TEXT,
    "area" TEXT,
    "industry" TEXT,
    "global_customer" BOOLEAN NOT NULL DEFAULT false,
    "measurement_unit" "MeasurementUnit" NOT NULL DEFAULT 'CENTIMETER',
    "geo_location" TEXT,
    "disable_customer_origin" BOOLEAN NOT NULL DEFAULT false,
    "enable_tax_duties_paid_by" BOOLEAN NOT NULL DEFAULT false,
    "enable_awb_no" BOOLEAN NOT NULL DEFAULT false,
    "e_statement" BOOLEAN NOT NULL DEFAULT false,
    "e_invoice" BOOLEAN NOT NULL DEFAULT false,
    "allow_zero_amount" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_fuel_surcharges" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE NOT NULL,
    "vendor" TEXT,
    "product_id" UUID,
    "destination_id" UUID,
    "service" TEXT,
    "percentage" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customer_fuel_surcharges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_charges" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "charge_id" UUID NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE NOT NULL,
    "vendor" TEXT,
    "service" TEXT,
    "product_id" UUID,
    "origin_id" UUID,
    "destination_id" UUID,
    "value" DECIMAL(14,4) NOT NULL,
    "minimum_value" DECIMAL(14,4),
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customer_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_volumetrics" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "product_id" UUID,
    "vendor" TEXT,
    "service" TEXT,
    "cft" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "centimetre_divide" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "inch_divide" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customer_volumetrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_contacts" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "contact_type" TEXT NOT NULL,
    "from_date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT,
    "email" TEXT,
    "mobile" TEXT NOT NULL,
    "landline" TEXT,
    "extension" TEXT,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "address_line3" TEXT,
    "pin_code" TEXT NOT NULL,
    "city" TEXT,
    "state_code" TEXT,
    "country_code" TEXT NOT NULL DEFAULT 'IN',
    "remark" TEXT,
    "passport_no" TEXT,
    "aadhaar" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "iec_no" TEXT,
    "ad_code" TEXT,
    "lut_no" TEXT,
    "kyc_path" TEXT,
    "default_shipper" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customer_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customers_client_id_code_idx" ON "customers"("client_id", "code");

-- CreateIndex
CREATE INDEX "customers_client_id_name_idx" ON "customers"("client_id", "name");

-- CreateIndex
CREATE INDEX "customers_client_id_service_centre_id_idx" ON "customers"("client_id", "service_centre_id");

-- CreateIndex
CREATE INDEX "customers_client_id_idx" ON "customers"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_client_id_id_key" ON "customers"("client_id", "id");

-- CreateIndex
CREATE INDEX "customer_fuel_surcharges_client_id_customer_id_idx" ON "customer_fuel_surcharges"("client_id", "customer_id");

-- CreateIndex
CREATE INDEX "customer_fuel_surcharges_client_id_customer_id_from_date_to_idx" ON "customer_fuel_surcharges"("client_id", "customer_id", "from_date", "to_date");

-- CreateIndex
CREATE INDEX "customer_fuel_surcharges_client_id_idx" ON "customer_fuel_surcharges"("client_id");

-- CreateIndex
CREATE INDEX "customer_charges_client_id_customer_id_idx" ON "customer_charges"("client_id", "customer_id");

-- CreateIndex
CREATE INDEX "customer_charges_client_id_customer_id_from_date_to_date_idx" ON "customer_charges"("client_id", "customer_id", "from_date", "to_date");

-- CreateIndex
CREATE INDEX "customer_charges_client_id_idx" ON "customer_charges"("client_id");

-- CreateIndex
CREATE INDEX "customer_volumetrics_client_id_customer_id_idx" ON "customer_volumetrics"("client_id", "customer_id");

-- CreateIndex
CREATE INDEX "customer_volumetrics_client_id_idx" ON "customer_volumetrics"("client_id");

-- CreateIndex
CREATE INDEX "customer_contacts_client_id_customer_id_idx" ON "customer_contacts"("client_id", "customer_id");

-- CreateIndex
CREATE INDEX "customer_contacts_client_id_idx" ON "customer_contacts"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "designations_client_id_id_key" ON "designations"("client_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "products_client_id_id_key" ON "products"("client_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_executives_client_id_id_key" ON "sales_executives"("client_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "service_centres_client_id_id_key" ON "service_centres"("client_id", "id");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_client_id_service_centre_id_fkey" FOREIGN KEY ("client_id", "service_centre_id") REFERENCES "service_centres"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_client_id_origin_id_fkey" FOREIGN KEY ("client_id", "origin_id") REFERENCES "destinations"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_client_id_branch_id_fkey" FOREIGN KEY ("client_id", "branch_id") REFERENCES "branches"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_client_id_sales_executive_id_fkey" FOREIGN KEY ("client_id", "sales_executive_id") REFERENCES "sales_executives"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_fuel_surcharges" ADD CONSTRAINT "customer_fuel_surcharges_client_id_customer_id_fkey" FOREIGN KEY ("client_id", "customer_id") REFERENCES "customers"("client_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_fuel_surcharges" ADD CONSTRAINT "customer_fuel_surcharges_client_id_product_id_fkey" FOREIGN KEY ("client_id", "product_id") REFERENCES "products"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_fuel_surcharges" ADD CONSTRAINT "customer_fuel_surcharges_client_id_destination_id_fkey" FOREIGN KEY ("client_id", "destination_id") REFERENCES "destinations"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_charges" ADD CONSTRAINT "customer_charges_client_id_customer_id_fkey" FOREIGN KEY ("client_id", "customer_id") REFERENCES "customers"("client_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_charges" ADD CONSTRAINT "customer_charges_client_id_charge_id_fkey" FOREIGN KEY ("client_id", "charge_id") REFERENCES "charges"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_charges" ADD CONSTRAINT "customer_charges_client_id_product_id_fkey" FOREIGN KEY ("client_id", "product_id") REFERENCES "products"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_charges" ADD CONSTRAINT "customer_charges_client_id_origin_id_fkey" FOREIGN KEY ("client_id", "origin_id") REFERENCES "destinations"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_charges" ADD CONSTRAINT "customer_charges_client_id_destination_id_fkey" FOREIGN KEY ("client_id", "destination_id") REFERENCES "destinations"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_volumetrics" ADD CONSTRAINT "customer_volumetrics_client_id_customer_id_fkey" FOREIGN KEY ("client_id", "customer_id") REFERENCES "customers"("client_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_volumetrics" ADD CONSTRAINT "customer_volumetrics_client_id_product_id_fkey" FOREIGN KEY ("client_id", "product_id") REFERENCES "products"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_client_id_customer_id_fkey" FOREIGN KEY ("client_id", "customer_id") REFERENCES "customers"("client_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Soft-deleted rows must not squat their codes. Prisma cannot express a
-- partial index, so it is written here and the service repeats the predicate
-- in its ON CONFLICT clauses.
CREATE UNIQUE INDEX "customers_client_id_code_key"
  ON "customers" ("client_id", "code") WHERE "deleted_at" IS NULL;

-- A date range that ends before it starts prices nothing and is always a
-- typo. Cheaper to reject here than to explain later why an invoice missed a
-- surcharge.
ALTER TABLE "customer_fuel_surcharges"
  ADD CONSTRAINT "customer_fuel_surcharges_dates_check" CHECK ("to_date" >= "from_date");
ALTER TABLE "customer_charges"
  ADD CONSTRAINT "customer_charges_dates_check" CHECK ("to_date" >= "from_date");

-- A surcharge is a percentage. Anything outside 0–100 is a data-entry error,
-- and this one multiplies freight on every consignment the customer books.
ALTER TABLE "customer_fuel_surcharges"
  ADD CONSTRAINT "customer_fuel_surcharges_percentage_check"
  CHECK ("percentage" >= 0 AND "percentage" <= 100);

-- Divisors are non-negative. Zero is meaningful — it reads as "not agreed",
-- and the booking screen falls back to the client default — but a negative
-- divisor would invert the chargeable weight.
ALTER TABLE "customer_volumetrics"
  ADD CONSTRAINT "customer_volumetrics_divisors_check"
  CHECK ("cft" >= 0 AND "centimetre_divide" >= 0 AND "inch_divide" >= 0);

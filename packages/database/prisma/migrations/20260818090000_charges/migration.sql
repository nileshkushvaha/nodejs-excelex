-- CreateEnum
CREATE TYPE "ChargeType" AS ENUM ('AIRWAYBILL', 'EXPENSE', 'INCOME', 'PURCHASE');

-- CreateEnum
CREATE TYPE "ChargeCalculationBase" AS ENUM ('ACTUAL_WEIGHT', 'CHARGE_WEIGHT', 'COD_AMOUNT', 'COMMERCIAL', 'FLAT', 'FREIGHT', 'ODA', 'ODA1', 'ODA2', 'ODA3', 'PIECES', 'POINT', 'SHIPMENT_VALUE');

-- CreateTable
CREATE TABLE "charges" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "charge_type" "ChargeType" NOT NULL DEFAULT 'AIRWAYBILL',
    "calculation_base" "ChargeCalculationBase" NOT NULL DEFAULT 'FLAT',
    "rate" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "apply_fuel" BOOLEAN NOT NULL DEFAULT false,
    "apply_tax_on_fuel" BOOLEAN NOT NULL DEFAULT false,
    "apply_tax" BOOLEAN NOT NULL DEFAULT false,
    "hsn_code" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "apply_fuel_on_components" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "charge_components" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "charge_id" UUID NOT NULL,
    "component_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "charge_components_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "charges_client_id_code_idx" ON "charges"("client_id", "code");

-- CreateIndex
CREATE INDEX "charges_client_id_sequence_idx" ON "charges"("client_id", "sequence");

-- CreateIndex
CREATE INDEX "charges_client_id_idx" ON "charges"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "charges_client_id_id_key" ON "charges"("client_id", "id");

-- CreateIndex
CREATE INDEX "charge_components_client_id_component_id_idx" ON "charge_components"("client_id", "component_id");

-- CreateIndex
CREATE INDEX "charge_components_client_id_idx" ON "charge_components"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "charge_components_client_id_charge_id_component_id_key" ON "charge_components"("client_id", "charge_id", "component_id");

-- AddForeignKey
ALTER TABLE "charge_components" ADD CONSTRAINT "charge_components_client_id_charge_id_fkey" FOREIGN KEY ("client_id", "charge_id") REFERENCES "charges"("client_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charge_components" ADD CONSTRAINT "charge_components_client_id_component_id_fkey" FOREIGN KEY ("client_id", "component_id") REFERENCES "charges"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Soft-deleted rows must not squat their codes.
CREATE UNIQUE INDEX "charges_client_id_code_key"
  ON "charges" ("client_id", "code") WHERE "deleted_at" IS NULL;

-- A charge cannot be a component of itself. The application checks this too;
-- the constraint is what makes it true of the data rather than of one code path.
ALTER TABLE "charge_components"
  ADD CONSTRAINT "charge_components_not_self"
  CHECK ("charge_id" <> "component_id");

-- A rate is an amount or a multiplier, never a negative one. Enforced here for
-- the same reason the commission ceiling is: a sign error in a charge reaches
-- an invoice.
ALTER TABLE "charges"
  ADD CONSTRAINT "charges_rate_non_negative" CHECK ("rate" >= 0);

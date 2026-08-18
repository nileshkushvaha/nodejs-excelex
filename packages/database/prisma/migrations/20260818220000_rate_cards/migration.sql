-- CreateEnum
CREATE TYPE "RateKind" AS ENUM ('SELL', 'BUY');

-- CreateEnum
CREATE TYPE "WeightUnit" AS ENUM ('KGS', 'LBS');

-- CreateEnum
CREATE TYPE "RateLineType" AS ENUM ('UPTO', 'INITIAL', 'ADDITIONAL', 'PLUS', 'PLUSKG');

-- CreateTable
CREATE TABLE "rate_cards" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "kind" "RateKind" NOT NULL DEFAULT 'SELL',
    "customer_id" UUID,
    "origin_id" UUID,
    "destination_id" UUID,
    "product_id" UUID,
    "zone_id" UUID,
    "origin_zone_id" UUID,
    "vendor" TEXT,
    "service" TEXT,
    "country_code" TEXT,
    "contract_no" TEXT,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "unit" "WeightUnit" NOT NULL DEFAULT 'KGS',
    "days" INTEGER,
    "awb_charge" DECIMAL(14,4),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rate_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_lines" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "rate_card_id" UUID NOT NULL,
    "line_type" "RateLineType" NOT NULL,
    "weight" DECIMAL(10,3) NOT NULL,
    "rate" DECIMAL(14,4) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rate_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rate_cards_client_id_customer_id_effective_from_idx" ON "rate_cards"("client_id", "customer_id", "effective_from");

-- CreateIndex
CREATE INDEX "rate_cards_client_id_effective_from_effective_to_idx" ON "rate_cards"("client_id", "effective_from", "effective_to");

-- CreateIndex
CREATE INDEX "rate_cards_client_id_idx" ON "rate_cards"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "rate_cards_client_id_id_key" ON "rate_cards"("client_id", "id");

-- CreateIndex
CREATE INDEX "rate_lines_client_id_rate_card_id_weight_idx" ON "rate_lines"("client_id", "rate_card_id", "weight");

-- CreateIndex
CREATE INDEX "rate_lines_client_id_idx" ON "rate_lines"("client_id");

-- AddForeignKey
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_client_id_customer_id_fkey" FOREIGN KEY ("client_id", "customer_id") REFERENCES "customers"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_client_id_product_id_fkey" FOREIGN KEY ("client_id", "product_id") REFERENCES "products"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_client_id_origin_id_fkey" FOREIGN KEY ("client_id", "origin_id") REFERENCES "destinations"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_client_id_destination_id_fkey" FOREIGN KEY ("client_id", "destination_id") REFERENCES "destinations"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_client_id_zone_id_fkey" FOREIGN KEY ("client_id", "zone_id") REFERENCES "zones"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_client_id_origin_zone_id_fkey" FOREIGN KEY ("client_id", "origin_zone_id") REFERENCES "zones"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_lines" ADD CONSTRAINT "rate_lines_client_id_rate_card_id_fkey" FOREIGN KEY ("client_id", "rate_card_id") REFERENCES "rate_cards"("client_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A tariff that ends before it starts prices nothing and is always a typo.
ALTER TABLE "rate_cards"
  ADD CONSTRAINT "rate_cards_dates_check"
  CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from");

-- Negative money is not a discount, it is a credit note nobody asked for,
-- and it would reach an invoice silently.
ALTER TABLE "rate_lines"
  ADD CONSTRAINT "rate_lines_amounts_check" CHECK ("rate" >= 0 AND "weight" >= 0);
ALTER TABLE "rate_cards"
  ADD CONSTRAINT "rate_cards_awb_check" CHECK ("awb_charge" IS NULL OR "awb_charge" >= 0);

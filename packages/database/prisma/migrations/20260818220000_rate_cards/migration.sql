-- CreateEnum
CREATE TYPE "RateCardKind" AS ENUM ('SELL', 'BUY');

-- CreateTable
CREATE TABLE "rate_cards" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "RateCardKind" NOT NULL DEFAULT 'SELL',
    "customer_id" UUID,
    "vendor" TEXT,
    "product_id" UUID,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rate_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_card_rows" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "rate_card_id" UUID NOT NULL,
    "origin_zone_id" UUID,
    "destination_zone_id" UUID,
    "base_weight" DECIMAL(10,3) NOT NULL DEFAULT 0.5,
    "base_amount" DECIMAL(14,4) NOT NULL,
    "additional_weight" DECIMAL(10,3) NOT NULL DEFAULT 0.5,
    "additional_amount" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "minimum_amount" DECIMAL(14,4),
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rate_card_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rate_cards_client_id_code_idx" ON "rate_cards"("client_id", "code");

-- CreateIndex
CREATE INDEX "rate_cards_client_id_customer_id_idx" ON "rate_cards"("client_id", "customer_id");

-- CreateIndex
CREATE INDEX "rate_cards_client_id_effective_from_effective_to_idx" ON "rate_cards"("client_id", "effective_from", "effective_to");

-- CreateIndex
CREATE INDEX "rate_cards_client_id_idx" ON "rate_cards"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "rate_cards_client_id_id_key" ON "rate_cards"("client_id", "id");

-- CreateIndex
CREATE INDEX "rate_card_rows_client_id_rate_card_id_idx" ON "rate_card_rows"("client_id", "rate_card_id");

-- CreateIndex
CREATE INDEX "rate_card_rows_client_id_idx" ON "rate_card_rows"("client_id");

-- AddForeignKey
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_client_id_customer_id_fkey" FOREIGN KEY ("client_id", "customer_id") REFERENCES "customers"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_client_id_product_id_fkey" FOREIGN KEY ("client_id", "product_id") REFERENCES "products"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_card_rows" ADD CONSTRAINT "rate_card_rows_client_id_rate_card_id_fkey" FOREIGN KEY ("client_id", "rate_card_id") REFERENCES "rate_cards"("client_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_card_rows" ADD CONSTRAINT "rate_card_rows_client_id_origin_zone_id_fkey" FOREIGN KEY ("client_id", "origin_zone_id") REFERENCES "zones"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_card_rows" ADD CONSTRAINT "rate_card_rows_client_id_destination_zone_id_fkey" FOREIGN KEY ("client_id", "destination_zone_id") REFERENCES "zones"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Soft-deleted cards must not squat their codes.
CREATE UNIQUE INDEX "rate_cards_client_id_code_key"
  ON "rate_cards" ("client_id", "code") WHERE "deleted_at" IS NULL;

-- A card that ends before it starts prices nothing and is always a typo.
ALTER TABLE "rate_cards"
  ADD CONSTRAINT "rate_cards_dates_check"
  CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from");

-- Money and weight must be positive. A negative rate is not a discount, it is
-- a credit note nobody asked for, and it would reach an invoice silently.
ALTER TABLE "rate_card_rows"
  ADD CONSTRAINT "rate_card_rows_amounts_check"
  CHECK (
    "base_amount" >= 0 AND "additional_amount" >= 0
    AND ("minimum_amount" IS NULL OR "minimum_amount" >= 0)
  );

-- A step of zero would divide by zero when working out how many steps a
-- consignment needs. The base may be zero — some lanes start charging from
-- the first gram — but the step may not.
ALTER TABLE "rate_card_rows"
  ADD CONSTRAINT "rate_card_rows_weights_check"
  CHECK ("base_weight" >= 0 AND "additional_weight" > 0);

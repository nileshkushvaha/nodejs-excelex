
-- CreateEnum
CREATE TYPE "ShipmentContentKind" AS ENUM ('DOX', 'NDOX');

-- CreateTable
CREATE TABLE "product_types" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "product_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_groups" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "product_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "product_type_id" UUID,
    "product_group_id" UUID,
    "service" TEXT,
    "content_kind" "ShipmentContentKind" NOT NULL DEFAULT 'NDOX',
    "fuel_charge" BOOLEAN NOT NULL DEFAULT true,
    "gst_reverse" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_types_client_id_idx" ON "product_types"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_types_client_id_id_key" ON "product_types"("client_id", "id");

-- CreateIndex
CREATE INDEX "product_groups_client_id_idx" ON "product_groups"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_groups_client_id_id_key" ON "product_groups"("client_id", "id");

-- CreateIndex
CREATE INDEX "products_client_id_code_idx" ON "products"("client_id", "code");

-- CreateIndex
CREATE INDEX "products_client_id_idx" ON "products"("client_id");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_client_id_product_type_id_fkey" FOREIGN KEY ("client_id", "product_type_id") REFERENCES "product_types"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_client_id_product_group_id_fkey" FOREIGN KEY ("client_id", "product_group_id") REFERENCES "product_groups"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Soft-deleted rows must not squat their codes.
CREATE UNIQUE INDEX "product_types_client_id_code_key"
  ON "product_types" ("client_id", "code") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "product_groups_client_id_code_key"
  ON "product_groups" ("client_id", "code") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "products_client_id_code_key"
  ON "products" ("client_id", "code") WHERE "deleted_at" IS NULL;

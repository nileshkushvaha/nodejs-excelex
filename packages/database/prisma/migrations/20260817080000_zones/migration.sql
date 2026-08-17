
-- CreateTable
CREATE TABLE "zones" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "zones_client_id_code_idx" ON "zones"("client_id", "code");

-- CreateIndex
CREATE INDEX "zones_client_id_idx" ON "zones"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "zones_client_id_id_key" ON "zones"("client_id", "id");


CREATE UNIQUE INDEX "zones_client_id_code_key"
  ON "zones" ("client_id", "code") WHERE "deleted_at" IS NULL;

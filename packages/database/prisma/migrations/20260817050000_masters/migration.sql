
-- CreateTable
CREATE TABLE "countries" (
    "code" TEXT NOT NULL,
    "alpha3" TEXT NOT NULL,
    "numeric" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "official_name" TEXT,
    "dial_code" TEXT,
    "currency" TEXT,
    "region" TEXT,
    "subregion" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "states" (
    "id" UUID NOT NULL,
    "country_code" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'STATE',
    "gst_code" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "designations" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "department_id" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "level" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "designations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "countries_alpha3_key" ON "countries"("alpha3");

-- CreateIndex
CREATE UNIQUE INDEX "countries_numeric_key" ON "countries"("numeric");

-- CreateIndex
CREATE INDEX "countries_name_idx" ON "countries"("name");

-- CreateIndex
CREATE INDEX "states_country_code_name_idx" ON "states"("country_code", "name");

-- CreateIndex
CREATE UNIQUE INDEX "states_country_code_code_key" ON "states"("country_code", "code");

-- CreateIndex
CREATE INDEX "departments_client_id_code_idx" ON "departments"("client_id", "code");

-- CreateIndex
CREATE INDEX "departments_client_id_idx" ON "departments"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "departments_client_id_id_key" ON "departments"("client_id", "id");

-- CreateIndex
CREATE INDEX "designations_client_id_code_idx" ON "designations"("client_id", "code");

-- CreateIndex
CREATE INDEX "designations_client_id_department_id_idx" ON "designations"("client_id", "department_id");

-- CreateIndex
CREATE INDEX "designations_client_id_idx" ON "designations"("client_id");

-- AddForeignKey
ALTER TABLE "states" ADD CONSTRAINT "states_country_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "designations" ADD CONSTRAINT "designations_client_id_department_id_fkey" FOREIGN KEY ("client_id", "department_id") REFERENCES "departments"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Soft-deleted rows must not squat their own codes. Partial unique indexes,
-- which Prisma cannot express, for the same reason as roles and branches.
CREATE UNIQUE INDEX "departments_client_id_code_key"
  ON "departments" ("client_id", "code") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "departments_client_id_name_key"
  ON "departments" ("client_id", "name") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "designations_client_id_code_key"
  ON "designations" ("client_id", "code") WHERE "deleted_at" IS NULL;

-- Reference codes have a fixed shape. Checking it here means a bad row cannot
-- be introduced by a console session either.
ALTER TABLE "countries" ADD CONSTRAINT "countries_code_shape"
  CHECK ("code" ~ '^[A-Z]{2}$' AND "alpha3" ~ '^[A-Z]{3}$' AND "numeric" ~ '^[0-9]{3}$');

ALTER TABLE "states" ADD CONSTRAINT "states_type_known"
  CHECK ("type" IN ('STATE', 'UNION_TERRITORY', 'PROVINCE', 'REGION', 'DISTRICT'));

-- India's GST state code is two digits and is the prefix of every GSTIN issued
-- there; a wrong one produces a tax document that fails validation.
ALTER TABLE "states" ADD CONSTRAINT "states_gst_code_shape"
  CHECK ("gst_code" IS NULL OR "gst_code" ~ '^[0-9]{2}$');

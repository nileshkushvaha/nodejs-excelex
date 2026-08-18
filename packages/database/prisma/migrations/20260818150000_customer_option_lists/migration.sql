-- CreateEnum
CREATE TYPE "CustomerKind" AS ENUM ('CUSTOMER', 'CO_COURIER', 'FRANCHISEE');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('ALL', 'DAILY', 'WEEKLY', 'FORTNIGHTLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "FirmType" AS ENUM ('GOVT', 'NON_GOVT');

-- CreateEnum
CREATE TYPE "ShipperType" AS ENUM ('INDIVIDUAL', 'MSME');

-- CreateEnum
CREATE TYPE "ChargeValueType" AS ENUM ('PERCENTAGE', 'AMOUNT');

-- AlterEnum
ALTER TYPE "CustomerPaymentType" ADD VALUE 'CHEQUE';

-- AlterEnum
BEGIN;
CREATE TYPE "CustomerRegisterType_new" AS ENUM ('REGISTERED', 'UNREGISTERED', 'B2B', 'B2C');
ALTER TABLE "public"."customers" ALTER COLUMN "register_type" DROP DEFAULT;
ALTER TABLE "customers" ALTER COLUMN "register_type" TYPE "CustomerRegisterType_new" USING ("register_type"::text::"CustomerRegisterType_new");
ALTER TYPE "CustomerRegisterType" RENAME TO "CustomerRegisterType_old";
ALTER TYPE "CustomerRegisterType_new" RENAME TO "CustomerRegisterType";
DROP TYPE "public"."CustomerRegisterType_old";
ALTER TABLE "customers" ALTER COLUMN "register_type" SET DEFAULT 'REGISTERED';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "IncentiveType_new" AS ENUM ('PERCENTAGE', 'INCENTIVE', 'FIXED');
ALTER TABLE "public"."customers" ALTER COLUMN "incentive_type" DROP DEFAULT;
ALTER TABLE "customers" ALTER COLUMN "incentive_type" TYPE "IncentiveType_new" USING ("incentive_type"::text::"IncentiveType_new");
ALTER TYPE "IncentiveType" RENAME TO "IncentiveType_old";
ALTER TYPE "IncentiveType_new" RENAME TO "IncentiveType";
DROP TYPE "public"."IncentiveType_old";
ALTER TABLE "customers" ALTER COLUMN "incentive_type" SET DEFAULT 'PERCENTAGE';
COMMIT;

-- AlterTable
ALTER TABLE "customer_charges" ADD COLUMN     "value_type" "ChargeValueType" NOT NULL DEFAULT 'AMOUNT';

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "contract_document_path" TEXT,
ADD COLUMN     "contract_end_date" DATE,
ADD COLUMN     "contract_no" TEXT,
ADD COLUMN     "contract_notes" TEXT,
ADD COLUMN     "contract_start_date" DATE,
ADD COLUMN     "credit_limit" DECIMAL(14,2),
ADD COLUMN     "security_deposit" DECIMAL(14,2),
DROP COLUMN "customer_type",
ADD COLUMN     "customer_type" "CustomerKind" NOT NULL DEFAULT 'CUSTOMER',
DROP COLUMN "billing_type",
ADD COLUMN     "billing_type" "BillingCycle",
DROP COLUMN "firm",
ADD COLUMN     "firm" "FirmType",
DROP COLUMN "shipper_type",
ADD COLUMN     "shipper_type" "ShipperType",
ALTER COLUMN "incentive_type" SET DEFAULT 'PERCENTAGE';


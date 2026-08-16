
-- CreateEnum
CREATE TYPE "PermissionEffect" AS ENUM ('ALLOW', 'DENY');

-- DropIndex
DROP INDEX "user_roles_client_id_idx";

-- DropIndex
DROP INDEX "user_roles_client_id_user_id_role_id_key";

-- AlterTable
ALTER TABLE "roles" DROP COLUMN "permissions";

-- AlterTable
ALTER TABLE "user_roles" ADD COLUMN     "branch_id" UUID,
ADD COLUMN     "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "expires_at" TIMESTAMPTZ(6),
ADD COLUMN     "granted_by_id" UUID;

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "permission_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_permissions" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "permission_key" TEXT NOT NULL,
    "effect" "PermissionEffect" NOT NULL DEFAULT 'ALLOW',
    "reason" TEXT,
    "expires_at" TIMESTAMPTZ(6),
    "granted_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "key" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "deprecated" BOOLEAN NOT NULL DEFAULT false,
    "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "role_permissions_client_id_idx" ON "role_permissions"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_client_id_role_id_permission_key_key" ON "role_permissions"("client_id", "role_id", "permission_key");

-- CreateIndex
CREATE INDEX "user_permissions_client_id_user_id_idx" ON "user_permissions"("client_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_permissions_client_id_user_id_permission_key_key" ON "user_permissions"("client_id", "user_id", "permission_key");

-- CreateIndex
CREATE INDEX "user_roles_client_id_user_id_idx" ON "user_roles"("client_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_client_id_user_id_role_id_branch_id_key" ON "user_roles"("client_id", "user_id", "role_id", "branch_id");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_client_id_branch_id_fkey" FOREIGN KEY ("client_id", "branch_id") REFERENCES "branches"("client_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_client_id_role_id_fkey" FOREIGN KEY ("client_id", "role_id") REFERENCES "roles"("client_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_client_id_user_id_fkey" FOREIGN KEY ("client_id", "user_id") REFERENCES "users"("client_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────
-- Constraints Prisma cannot express
-- ─────────────────────────────────────────────────────────────

-- A NULL branch_id means "every branch". Under the default NULLS DISTINCT the
-- unique index does not see two such rows as duplicates, so the same
-- client-wide role could be assigned to the same person repeatedly.
DROP INDEX "user_roles_client_id_user_id_role_id_branch_id_key";
CREATE UNIQUE INDEX "user_roles_client_id_user_id_role_id_branch_id_key"
  ON "user_roles" ("client_id", "user_id", "role_id", "branch_id") NULLS NOT DISTINCT;

-- Grant rows carry no foreign key to `permissions`, because a grant may be a
-- wildcard (`operations.*`) which has no catalogue row by definition. Existence
-- is checked in the service layer against the typed catalogue; the *shape* is
-- checked here, so a malformed key cannot be stored at all.
--
-- Accepts: `*`, `domain.resource.action`, or a segment-boundary wildcard such
-- as `operations.*`. Rejects `operations.ship*` — a wildcard that stops
-- mid-segment is almost always a typo, and silently over-grants.
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_key_shape"
  CHECK ("permission_key" ~ '^(\*|[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*(\.\*)?)$');

ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_key_shape"
  CHECK ("permission_key" ~ '^(\*|[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*(\.\*)?)$');

-- A denial nobody can explain later is one nobody dares remove.
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_deny_needs_reason"
  CHECK ("effect" <> 'DENY' OR ("reason" IS NOT NULL AND length(btrim("reason")) > 0));


-- AlterTable
ALTER TABLE "users" ADD COLUMN     "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "last_failed_login_at" TIMESTAMPTZ(6),
ADD COLUMN     "locked_until" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "security_settings" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "lock_after_failed_attempts" BOOLEAN NOT NULL DEFAULT true,
    "max_failed_attempts" INTEGER NOT NULL DEFAULT 5,
    "lockout_minutes" INTEGER NOT NULL DEFAULT 15,
    "idle_timeout_minutes" INTEGER NOT NULL DEFAULT 60,
    "absolute_timeout_hours" INTEGER NOT NULL DEFAULT 12,
    "allow_multiple_sessions" BOOLEAN NOT NULL DEFAULT true,
    "force_logout_on_password_change" BOOLEAN NOT NULL DEFAULT true,
    "login_throttle_enabled" BOOLEAN NOT NULL DEFAULT true,
    "reset_throttle_enabled" BOOLEAN NOT NULL DEFAULT true,
    "notify_user_on_failed_attempts" BOOLEAN NOT NULL DEFAULT false,
    "notify_user_on_lock" BOOLEAN NOT NULL DEFAULT true,
    "notify_admin_on_lock" BOOLEAN NOT NULL DEFAULT false,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "security_settings_client_id_key" ON "security_settings"("client_id");


ALTER TABLE "security_settings" ADD CONSTRAINT "security_settings_sane_bounds" CHECK (
  "max_failed_attempts" BETWEEN 1 AND 100
  AND "lockout_minutes" BETWEEN 0 AND 10080
  AND "idle_timeout_minutes" BETWEEN 1 AND 10080
  AND "absolute_timeout_hours" BETWEEN 1 AND 720
);

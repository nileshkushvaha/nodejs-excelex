-- CreateEnum
CREATE TYPE "LoginOutcome" AS ENUM ('SUCCEEDED', 'BAD_PASSWORD', 'INACTIVE', 'LOCKED', 'LOCKED_OUT', 'UNKNOWN_USER');

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "schedule_id" UUID;

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "user_id" UUID,
    "email" TEXT NOT NULL,
    "outcome" "LoginOutcome" NOT NULL,
    "host" TEXT NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "session_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "login_attempts_client_id_created_at_idx" ON "login_attempts"("client_id", "created_at");

-- CreateIndex
CREATE INDEX "login_attempts_client_id_user_id_created_at_idx" ON "login_attempts"("client_id", "user_id", "created_at");

-- CreateIndex
CREATE INDEX "login_attempts_client_id_outcome_created_at_idx" ON "login_attempts"("client_id", "outcome", "created_at");

-- CreateIndex
CREATE INDEX "login_attempts_client_id_idx" ON "login_attempts"("client_id");

-- CreateIndex
CREATE INDEX "jobs_client_id_schedule_id_created_at_idx" ON "jobs"("client_id", "schedule_id", "created_at");

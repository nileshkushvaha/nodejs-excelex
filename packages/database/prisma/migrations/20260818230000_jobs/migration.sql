-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "queue" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "scheduled_for" TIMESTAMPTZ(6),
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "duration_ms" INTEGER,
    "error" TEXT,
    "result" JSONB,
    "requested_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_schedules" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "queue" TEXT NOT NULL,
    "job_name" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "cron" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_run_at" TIMESTAMPTZ(6),
    "next_run_at" TIMESTAMPTZ(6),
    "last_status" "JobStatus",
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "job_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "jobs_client_id_status_created_at_idx" ON "jobs"("client_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "jobs_client_id_queue_created_at_idx" ON "jobs"("client_id", "queue", "created_at");

-- CreateIndex
CREATE INDEX "jobs_client_id_idx" ON "jobs"("client_id");

-- CreateIndex
CREATE INDEX "job_schedules_client_id_is_active_idx" ON "job_schedules"("client_id", "is_active");

-- CreateIndex
CREATE INDEX "job_schedules_client_id_idx" ON "job_schedules"("client_id");


-- One schedule per name per client. Soft-deleted rows must not squat a name.
CREATE UNIQUE INDEX "job_schedules_client_id_name_key"
  ON "job_schedules" ("client_id", "name") WHERE "deleted_at" IS NULL;

-- A job that has finished must say when it started, or its duration is a lie.
ALTER TABLE "jobs"
  ADD CONSTRAINT "jobs_timing_check"
  CHECK ("finished_at" IS NULL OR "started_at" IS NOT NULL);

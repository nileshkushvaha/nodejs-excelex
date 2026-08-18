-- CreateEnum
CREATE TYPE "ExceptionGroupStatus" AS ENUM ('OPEN', 'RESOLVED', 'IGNORED');

-- CreateTable
CREATE TABLE "exception_events" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "request_id" TEXT,
    "method" TEXT,
    "route" TEXT,
    "path" TEXT,
    "status" INTEGER,
    "code" TEXT NOT NULL,
    "exception_name" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "actor_id" UUID,
    "ip" TEXT,
    "context" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exception_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exception_groups" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "exception_name" TEXT NOT NULL,
    "route" TEXT,
    "source" TEXT NOT NULL,
    "status" "ExceptionGroupStatus" NOT NULL DEFAULT 'OPEN',
    "count" INTEGER NOT NULL DEFAULT 0,
    "first_seen_at" TIMESTAMPTZ(6) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL,
    "last_event_id" UUID,
    "resolved_at" TIMESTAMPTZ(6),
    "resolved_by_id" UUID,
    "regressed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "exception_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exception_events_client_id_fingerprint_created_at_idx" ON "exception_events"("client_id", "fingerprint", "created_at");

-- CreateIndex
CREATE INDEX "exception_events_client_id_created_at_idx" ON "exception_events"("client_id", "created_at");

-- CreateIndex
CREATE INDEX "exception_events_client_id_idx" ON "exception_events"("client_id");

-- CreateIndex
CREATE INDEX "exception_groups_client_id_status_last_seen_at_idx" ON "exception_groups"("client_id", "status", "last_seen_at");

-- CreateIndex
CREATE INDEX "exception_groups_client_id_idx" ON "exception_groups"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "exception_groups_client_id_fingerprint_key" ON "exception_groups"("client_id", "fingerprint");


-- CreateEnum
CREATE TYPE "NotificationSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" "NotificationSeverity" NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "mail_message_id" UUID,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_client_id_user_id_read_at_created_at_idx" ON "notifications"("client_id", "user_id", "read_at", "created_at");

-- CreateIndex
CREATE INDEX "notifications_client_id_kind_created_at_idx" ON "notifications"("client_id", "kind", "created_at");

-- CreateIndex
CREATE INDEX "notifications_client_id_idx" ON "notifications"("client_id");


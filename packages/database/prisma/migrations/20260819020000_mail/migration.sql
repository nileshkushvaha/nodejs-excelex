-- CreateEnum
CREATE TYPE "MailProvider" AS ENUM ('PLATFORM', 'SMTP');

-- CreateEnum
CREATE TYPE "MailStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "mail_settings" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "provider" "MailProvider" NOT NULL DEFAULT 'PLATFORM',
    "smtp_host" TEXT,
    "smtp_port" INTEGER,
    "smtp_secure" BOOLEAN NOT NULL DEFAULT false,
    "smtp_username" TEXT,
    "smtp_password_encrypted" TEXT,
    "from_name" TEXT,
    "from_email" TEXT,
    "reply_to" TEXT,
    "last_tested_at" TIMESTAMPTZ(6),
    "last_test_ok" BOOLEAN,
    "last_test_error" TEXT,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mail_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail_messages" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "to_email" TEXT NOT NULL,
    "to_name" TEXT,
    "subject" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "status" "MailStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "provider_message_id" TEXT,
    "job_id" UUID,
    "requested_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),

    CONSTRAINT "mail_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mail_settings_client_id_key" ON "mail_settings"("client_id");

-- CreateIndex
CREATE INDEX "mail_messages_client_id_created_at_idx" ON "mail_messages"("client_id", "created_at");

-- CreateIndex
CREATE INDEX "mail_messages_client_id_status_created_at_idx" ON "mail_messages"("client_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "mail_messages_client_id_template_created_at_idx" ON "mail_messages"("client_id", "template", "created_at");

-- CreateIndex
CREATE INDEX "mail_messages_client_id_idx" ON "mail_messages"("client_id");


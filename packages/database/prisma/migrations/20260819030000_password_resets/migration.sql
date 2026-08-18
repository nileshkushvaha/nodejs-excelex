-- CreateTable
CREATE TABLE "password_resets" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "code_salt" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "verified_at" TIMESTAMPTZ(6),
    "reset_token_hash" TEXT,
    "consumed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "ip" TEXT,
    "user_agent" TEXT,
    "request_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "password_resets_client_id_user_id_created_at_idx" ON "password_resets"("client_id", "user_id", "created_at");

-- CreateIndex
CREATE INDEX "password_resets_client_id_email_created_at_idx" ON "password_resets"("client_id", "email", "created_at");

-- CreateIndex
CREATE INDEX "password_resets_client_id_idx" ON "password_resets"("client_id");


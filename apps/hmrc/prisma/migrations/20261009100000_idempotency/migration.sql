-- CreateEnum
CREATE TYPE "IdempotencyStatus" AS ENUM ('COMPLETED');

-- CreateTable
CREATE TABLE "idempotency_record" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "payload_digest" TEXT NOT NULL,
    "status" "IdempotencyStatus" NOT NULL DEFAULT 'COMPLETED',
    "reference" TEXT,
    "response" JSONB NOT NULL,
    "admitted" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_record_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idempotency_record_created_at_idx" ON "idempotency_record"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_record_subject_operation_key_key" ON "idempotency_record"("subject", "operation", "key");

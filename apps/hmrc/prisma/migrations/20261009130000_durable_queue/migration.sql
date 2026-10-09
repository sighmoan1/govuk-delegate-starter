-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "transaction" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'QUEUED',
    "claim_reference" TEXT NOT NULL,
    "evidence_fingerprint" TEXT,
    "submitted_by" "SubmittedBy" NOT NULL,
    "agent_name" TEXT,
    "agent_id" TEXT,
    "mandate_id" TEXT,
    "delegation_id" TEXT,
    "delegate_check_id" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_token" TEXT,
    "lease_expires_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "last_error" TEXT,
    "outcome_reported" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transaction_claim_reference_key" ON "transaction"("claim_reference");

-- CreateIndex
CREATE INDEX "transaction_subject_status_idx" ON "transaction"("subject", "status");

-- CreateIndex
CREATE INDEX "transaction_subject_started_at_idx" ON "transaction"("subject", "started_at");

-- CreateIndex
CREATE INDEX "transaction_status_next_attempt_at_idx" ON "transaction"("status", "next_attempt_at");

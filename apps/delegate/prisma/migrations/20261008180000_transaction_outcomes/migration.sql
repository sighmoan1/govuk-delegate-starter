-- CreateEnum
CREATE TYPE "OutcomeStatus" AS ENUM ('SUBMITTED', 'ACCEPTED', 'FAILED', 'COMPLETED');

-- CreateTable
CREATE TABLE "transaction_outcome" (
    "id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "check_id" TEXT NOT NULL,
    "principal_id" TEXT NOT NULL,
    "mandate_id" TEXT NOT NULL,
    "delegation_id" TEXT,
    "delegate_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "status" "OutcomeStatus" NOT NULL,
    "reference" TEXT,
    "reason" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_outcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transaction_outcome_service_id_idempotency_key_key" ON "transaction_outcome"("service_id", "idempotency_key");
CREATE INDEX "transaction_outcome_check_id_idx" ON "transaction_outcome"("check_id");
CREATE INDEX "transaction_outcome_mandate_id_occurred_at_idx" ON "transaction_outcome"("mandate_id", "occurred_at");

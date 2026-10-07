-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('OPEN', 'CLOSED');

-- AlterEnum
ALTER TYPE "Lane" ADD VALUE 'DECLARED_AGENT';

-- AlterTable
ALTER TABLE "claim" ADD COLUMN     "delegation_id" TEXT,
ADD COLUMN     "evidence_fingerprint" TEXT,
ADD COLUMN     "mandate_id" TEXT,
ADD COLUMN     "status" "ClaimStatus" NOT NULL DEFAULT 'OPEN',
ADD COLUMN     "tax_year" TEXT;

-- AlterTable
ALTER TABLE "service_event" ADD COLUMN     "agent_label" TEXT,
ADD COLUMN     "assurance" TEXT,
ADD COLUMN     "automation_signals" JSONB,
ADD COLUMN     "capacity_limit" INTEGER,
ADD COLUMN     "capacity_used" INTEGER,
ADD COLUMN     "delegation_id" TEXT,
ADD COLUMN     "depth" INTEGER,
ADD COLUMN     "mandate_id" TEXT,
ADD COLUMN     "parent_delegation_id" TEXT,
ADD COLUMN     "rule" TEXT,
ADD COLUMN     "run_tag" TEXT,
ADD COLUMN     "session_id" TEXT,
ADD COLUMN     "signature_agent" TEXT,
ADD COLUMN     "signature_result" TEXT,
ADD COLUMN     "user_agent" TEXT;

-- CreateTable
CREATE TABLE "principal_usage" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "rule" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "principal_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "principal_usage_subject_rule_at_idx" ON "principal_usage"("subject", "rule", "at");


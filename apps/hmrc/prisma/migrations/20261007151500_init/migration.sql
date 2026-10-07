-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SubmittedBy" AS ENUM ('SELF', 'AGENT');

-- CreateEnum
CREATE TYPE "Lane" AS ENUM ('AUTHENTICATED_HUMAN', 'AUTHORISED_AGENT', 'UNTRUSTED');

-- CreateEnum
CREATE TYPE "Outcome" AS ENUM ('ALLOWED', 'REFUSED', 'THROTTLED', 'CHALLENGED');

-- CreateTable
CREATE TABLE "taxpayer" (
    "id" TEXT NOT NULL,
    "one_login_subject" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tax_code" TEXT NOT NULL,
    "employer" TEXT NOT NULL,
    "tax_year" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "taxpayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim" (
    "id" TEXT NOT NULL,
    "taxpayer_id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "new_tax_code" TEXT,
    "submitted_by" "SubmittedBy" NOT NULL,
    "agent_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_event" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lane" "Lane" NOT NULL,
    "outcome" "Outcome" NOT NULL,
    "reason" TEXT,
    "capability" TEXT,
    "path" TEXT NOT NULL,
    "agent_name" TEXT,
    "agent_id" TEXT,
    "subject" TEXT,
    "latency_ms" INTEGER NOT NULL,
    "delegate_check_id" TEXT,

    CONSTRAINT "service_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "taxpayer_one_login_subject_key" ON "taxpayer"("one_login_subject");

-- CreateIndex
CREATE UNIQUE INDEX "claim_reference_key" ON "claim"("reference");

-- CreateIndex
CREATE INDEX "service_event_timestamp_idx" ON "service_event"("timestamp");

-- AddForeignKey
ALTER TABLE "claim" ADD CONSTRAINT "claim_taxpayer_id_fkey" FOREIGN KEY ("taxpayer_id") REFERENCES "taxpayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- CreateEnum
CREATE TYPE "QueryStatus" AS ENUM ('OPEN', 'ANSWERED');

-- CreateTable
CREATE TABLE "claim_query" (
    "id" TEXT NOT NULL,
    "claim_id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "status" "QueryStatus" NOT NULL DEFAULT 'OPEN',
    "asked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answer" TEXT,
    "answered_at" TIMESTAMP(3),
    "answered_by" "SubmittedBy",
    "answered_by_name" TEXT,
    "confirmed_by_person" BOOLEAN NOT NULL DEFAULT false,
    "mandate_id" TEXT,
    "delegation_id" TEXT,

    CONSTRAINT "claim_query_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "claim_query_claim_id_idx" ON "claim_query"("claim_id");

-- AddForeignKey
ALTER TABLE "claim_query" ADD CONSTRAINT "claim_query_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

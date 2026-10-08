-- AlterTable
ALTER TABLE "claim_query" ADD COLUMN "receipt_id" TEXT,
ADD COLUMN "answer_withdrawn" BOOLEAN NOT NULL DEFAULT false;

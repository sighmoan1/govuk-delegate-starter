-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('RECORDED', 'DISPUTED');

-- CreateTable
CREATE TABLE "receipt" (
    "id" TEXT NOT NULL,
    "principal_id" TEXT NOT NULL,
    "mandate_id" TEXT NOT NULL,
    "delegation_id" TEXT,
    "delegate_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "agent_confirmed" BOOLEAN NOT NULL,
    "status" "ReceiptStatus" NOT NULL DEFAULT 'RECORDED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seen_at" TIMESTAMP(3),
    "disputed_at" TIMESTAMP(3),

    CONSTRAINT "receipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "receipt_principal_id_created_at_idx" ON "receipt"("principal_id", "created_at");

-- CreateIndex
CREATE INDEX "receipt_mandate_id_idx" ON "receipt"("mandate_id");

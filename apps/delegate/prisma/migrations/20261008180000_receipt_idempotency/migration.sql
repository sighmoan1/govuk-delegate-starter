-- AlterTable
ALTER TABLE "receipt" ADD COLUMN "idempotency_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "receipt_idempotency_key_key" ON "receipt"("idempotency_key");

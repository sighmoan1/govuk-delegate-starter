-- Issue #19: a step-up approval is for one proposed transaction.
-- Existing rows have no proposal to bind to (they covered "the next use of the
-- capability"), so they cannot be carried over. Prototype data, synthetic only.
DELETE FROM "step_up";

ALTER TABLE "step_up"
  ADD COLUMN "principal_id" TEXT NOT NULL,
  ADD COLUMN "service_id" TEXT NOT NULL,
  ADD COLUMN "idempotency_key" TEXT NOT NULL,
  ADD COLUMN "payload_digest" TEXT NOT NULL,
  ADD COLUMN "proposal_hash" TEXT NOT NULL,
  ADD COLUMN "display" JSONB NOT NULL,
  ADD COLUMN "expires_at" TIMESTAMP(3) NOT NULL,
  ADD COLUMN "declined_at" TIMESTAMP(3),
  ADD COLUMN "reservation_id" TEXT,
  ADD COLUMN "reserved_at" TIMESTAMP(3),
  ADD COLUMN "reservation_expires_at" TIMESTAMP(3),
  ADD COLUMN "used_reference" TEXT;

DROP INDEX IF EXISTS "step_up_mandate_id_capability_status_idx";
CREATE INDEX "step_up_mandate_id_capability_idempotency_key_idx" ON "step_up" ("mandate_id", "capability", "idempotency_key");

-- At most one non-expired proposal per mandate + capability + key + content, so
-- two requests that propose the same thing at once cannot open two approvals.
-- Prisma's schema language cannot express partial indexes.
CREATE UNIQUE INDEX "step_up_one_live_proposal"
ON "step_up" ("mandate_id", "capability", "idempotency_key", "payload_digest")
WHERE "status" <> 'EXPIRED';

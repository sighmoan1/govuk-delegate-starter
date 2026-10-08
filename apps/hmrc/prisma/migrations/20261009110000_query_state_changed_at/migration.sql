-- When the query last changed state (asked, answered, withdrawn and reopened).
-- Progress polling compares this with `since`, so reopening a query is detected
-- even though it clears answered_at and leaves asked_at untouched.
ALTER TABLE "claim_query" ADD COLUMN "state_changed_at" TIMESTAMP(3);
UPDATE "claim_query" SET "state_changed_at" = COALESCE("answered_at", "asked_at");
ALTER TABLE "claim_query" ALTER COLUMN "state_changed_at" SET NOT NULL;
ALTER TABLE "claim_query" ALTER COLUMN "state_changed_at" SET DEFAULT CURRENT_TIMESTAMP;

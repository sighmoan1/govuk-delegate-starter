-- Distinguish HTTP requests, authorised checks, unique operations, business
-- refusals and technical throttles in HMRC's own log. Older rows keep NULLs.
ALTER TABLE "service_event"
  ADD COLUMN "outcome_class" TEXT,
  ADD COLUMN "cost_class" TEXT,
  ADD COLUMN "throttle_scope" TEXT,
  ADD COLUMN "retry_after_seconds" INTEGER,
  ADD COLUMN "authorised_check" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "detector_quota" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "calls" INTEGER NOT NULL CHECK ("calls" >= 0),
  "reserved_micro_usd" BIGINT NOT NULL CHECK ("reserved_micro_usd" >= 0),
  "next_allowed_at" TIMESTAMP(3) NOT NULL
);

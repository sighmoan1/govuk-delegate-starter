CREATE TABLE "observed_event" (
 "id" TEXT NOT NULL PRIMARY KEY, "source_service" TEXT NOT NULL, "source_event_id" TEXT NOT NULL,
 "schema_version" INTEGER NOT NULL, "occurred_at" TIMESTAMP(3) NOT NULL,
 "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "snapshot" JSONB NOT NULL
);
CREATE UNIQUE INDEX "observed_event_source_service_source_event_id_key" ON "observed_event"("source_service", "source_event_id");
CREATE TABLE "feed_cursor" (
 "source_service" TEXT NOT NULL PRIMARY KEY, "cursor" TEXT, "generation" INTEGER NOT NULL DEFAULT 0,
 "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "research_run" ("id" TEXT PRIMARY KEY, "mode" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'OPEN', "protocol_version" TEXT NOT NULL, "source_commit" TEXT NOT NULL, "seed" TEXT NOT NULL, "study_owner" TEXT NOT NULL, "evidence_digest" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "research_attempt" ("id" TEXT PRIMARY KEY, "run_id" TEXT NOT NULL REFERENCES "research_run"("id") ON DELETE CASCADE ON UPDATE CASCADE, "intent_id" TEXT NOT NULL, "status" TEXT NOT NULL, "execution_class" TEXT, "provenance" JSONB, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "verified_at" TIMESTAMP(3));
CREATE INDEX "research_attempt_run_id_idx" ON "research_attempt"("run_id");
CREATE TABLE "research_binding" ("id" TEXT PRIMARY KEY, "attempt_id" TEXT NOT NULL REFERENCES "research_attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE, "source_service" TEXT NOT NULL, "source_event_id" TEXT NOT NULL, "operation_id" TEXT, "event_kind" TEXT NOT NULL, "effect_class" TEXT NOT NULL, "effect_evidence_digest" TEXT, "identity_observation" JSONB NOT NULL);
CREATE UNIQUE INDEX "research_binding_source_service_source_event_id_key" ON "research_binding"("source_service", "source_event_id");
CREATE TABLE "research_enrolment" ("id" TEXT PRIMARY KEY, "attempt_id" TEXT NOT NULL REFERENCES "research_attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE, "token_hash" TEXT NOT NULL, "expires_at" TIMESTAMP(3) NOT NULL, "claimed_at" TIMESTAMP(3));
CREATE UNIQUE INDEX "research_enrolment_token_hash_key" ON "research_enrolment"("token_hash");
CREATE TABLE "research_session" ("id" TEXT PRIMARY KEY, "attempt_id" TEXT NOT NULL REFERENCES "research_attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE, "expires_at" TIMESTAMP(3) NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE UNIQUE INDEX "research_run_evidence_digest_key" ON "research_run"("evidence_digest");

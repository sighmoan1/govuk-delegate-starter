CREATE TABLE "experiment_analysis" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "corpus_digest" TEXT NOT NULL,
  "config_digest" TEXT NOT NULL,
  "corpus" JSONB NOT NULL,
  "report" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "experiment_analysis_created_at_idx" ON "experiment_analysis"("created_at");
CREATE FUNCTION reject_analysis_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Frozen synthetic analysis cannot be mutated'; END $$;
CREATE TRIGGER analysis_immutable BEFORE UPDATE OR DELETE ON "experiment_analysis"
FOR EACH ROW EXECUTE FUNCTION reject_analysis_mutation();

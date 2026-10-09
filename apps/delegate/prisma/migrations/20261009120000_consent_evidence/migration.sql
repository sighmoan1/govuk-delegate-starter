CREATE TABLE consent_evidence (
  id TEXT PRIMARY KEY,
  authorisation_id TEXT NOT NULL REFERENCES authorisation(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('APPROVED','SCOPE_REMOVED','REVOKED')),
  occurred_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payload JSONB NOT NULL
);
CREATE INDEX consent_evidence_authorisation_id_occurred_at_idx ON consent_evidence(authorisation_id, occurred_at);
CREATE UNIQUE INDEX consent_evidence_one_approval ON consent_evidence(authorisation_id) WHERE kind = 'APPROVED';
CREATE TABLE consent_evidence_access (
  id TEXT PRIMARY KEY,
  authorisation_id TEXT NOT NULL REFERENCES authorisation(id) ON DELETE CASCADE,
  principal_ref TEXT NOT NULL,
  occurred_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX consent_evidence_access_authorisation_id_occurred_at_idx ON consent_evidence_access(authorisation_id, occurred_at);

CREATE FUNCTION protect_consent_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Allow explicit parent deletion (synthetic fixture reset/data erasure); a
  -- catalogue update, narrowing or revocation never deletes the parent.
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM authorisation WHERE id = OLD.authorisation_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Consent evidence and access history are append-only';
END;
$$;
CREATE TRIGGER consent_evidence_append_only BEFORE UPDATE OR DELETE ON consent_evidence FOR EACH ROW EXECUTE FUNCTION protect_consent_evidence();
CREATE TRIGGER consent_evidence_access_append_only BEFORE UPDATE OR DELETE ON consent_evidence_access FOR EACH ROW EXECUTE FUNCTION protect_consent_evidence();

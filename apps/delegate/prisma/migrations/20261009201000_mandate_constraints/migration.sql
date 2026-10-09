ALTER TABLE "authorisation_request" ADD COLUMN "constraints" JSONB;
ALTER TABLE "authorisation" ADD COLUMN "constraints" JSONB;
ALTER TABLE "delegation" ADD COLUMN "constraints" JSONB;
ALTER TYPE "Reason" ADD VALUE 'CONSTRAINTS_INVALID';
ALTER TYPE "Reason" ADD VALUE 'CATALOGUE_INCOMPATIBLE';
ALTER TABLE consent_evidence DROP CONSTRAINT consent_evidence_kind_check;
ALTER TABLE consent_evidence ADD CONSTRAINT consent_evidence_kind_check CHECK (kind IN ('APPROVED','SCOPE_REMOVED','REVOKED','CONSTRAINTS_NARROWED'));

ALTER TABLE "authorisation_request" ADD COLUMN "constraints" JSONB;
ALTER TABLE "authorisation" ADD COLUMN "constraints" JSONB;
ALTER TABLE "delegation" ADD COLUMN "constraints" JSONB;
ALTER TYPE "Reason" ADD VALUE 'CONSTRAINTS_INVALID';
ALTER TYPE "Reason" ADD VALUE 'CATALOGUE_INCOMPATIBLE';

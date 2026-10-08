-- At most one ACTIVE authorisation per principal/delegate/service. Prisma's schema
-- language cannot express partial unique indexes, so this lives in SQL only.
-- Tidy any existing duplicates first, keeping the newest.
UPDATE "authorisation" a
SET "status" = 'REVOKED', "revoked_at" = now()
WHERE a."status" = 'ACTIVE'
  AND EXISTS (
    SELECT 1 FROM "authorisation" b
    WHERE b."status" = 'ACTIVE'
      AND b."principal_id" = a."principal_id"
      AND b."delegate_id" = a."delegate_id"
      AND b."service_id" = a."service_id"
      AND (b."created_at", b."id") > (a."created_at", a."id")
  );

CREATE UNIQUE INDEX "authorisation_one_active_per_relationship"
ON "authorisation" ("principal_id", "delegate_id", "service_id")
WHERE "status" = 'ACTIVE';

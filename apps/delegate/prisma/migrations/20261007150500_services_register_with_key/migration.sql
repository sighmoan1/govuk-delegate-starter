-- Services register with Delegate and get their own key for the check API.
-- Existing rows (seed data) get an unusable placeholder; the seed rewrites them.
ALTER TABLE "service" ADD COLUMN "api_key_hash" TEXT NOT NULL DEFAULT 'unset';
ALTER TABLE "service" ALTER COLUMN "api_key_hash" DROP DEFAULT;

-- The agent keeps its own conversations in its own database now.
DROP TABLE IF EXISTS "agent_conversation";

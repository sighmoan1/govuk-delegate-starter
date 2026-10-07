-- Example AI becomes a conversational assistant: drop the task-runner tables.
DROP TABLE IF EXISTS "step";
DROP TABLE IF EXISTS "run";
DROP TABLE IF EXISTS "flood_result";
DROP TYPE IF EXISTS "StepOutcome";
DROP TYPE IF EXISTS "RunStatus";
DROP TYPE IF EXISTS "Persona";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ASSISTANT');

-- CreateTable
CREATE TABLE "message" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "role" "Role" NOT NULL,
    "text" TEXT NOT NULL,
    "card" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connection" (
    "id" TEXT NOT NULL,
    "principal_id" TEXT,
    "granted" TEXT[],
    "pending_request_id" TEXT,
    "pending_intent" TEXT,
    "connected_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connection_pkey" PRIMARY KEY ("id")
);


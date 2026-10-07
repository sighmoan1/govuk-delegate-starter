-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Persona" AS ENUM ('AGENT', 'BOT');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('RUNNING', 'WAITING_FOR_PERSON', 'DONE');

-- CreateEnum
CREATE TYPE "StepOutcome" AS ENUM ('OK', 'REFUSED', 'WAITING', 'INFO');

-- CreateTable
CREATE TABLE "run" (
    "id" TEXT NOT NULL,
    "persona" "Persona" NOT NULL,
    "task" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'RUNNING',
    "principal_id" TEXT,
    "pending_request_id" TEXT,
    "granted" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "step" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "n" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "outcome" "StepOutcome" NOT NULL,
    "exchange" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flood_result" (
    "id" TEXT NOT NULL,
    "persona" "Persona" NOT NULL,
    "n" INTEGER NOT NULL,
    "counts" JSONB NOT NULL,
    "median_ms" INTEGER NOT NULL,
    "total_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flood_result_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "step" ADD CONSTRAINT "step_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "run"("id") ON DELETE CASCADE ON UPDATE CASCADE;


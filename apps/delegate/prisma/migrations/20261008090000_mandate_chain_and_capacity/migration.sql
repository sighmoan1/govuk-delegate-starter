-- CreateEnum
CREATE TYPE "Assurance" AS ENUM ('VERIFIED', 'REGISTERED', 'DECLARED');

-- CreateEnum
CREATE TYPE "IdentityType" AS ENUM ('CLIENT_CREDENTIALS', 'WEB_BOT_AUTH', 'DECLARED');

-- CreateEnum
CREATE TYPE "DelegationStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "StepUpStatus" AS ENUM ('PENDING', 'APPROVED', 'USED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Reason" ADD VALUE 'CAPACITY_EXCEEDED';
ALTER TYPE "Reason" ADD VALUE 'STEP_UP_REQUIRED';
ALTER TYPE "Reason" ADD VALUE 'DELEGATION_DEPTH_EXCEEDED';

-- AlterTable
ALTER TABLE "activity_event" ADD COLUMN     "assurance" "Assurance",
ADD COLUMN     "capacity_limit" INTEGER,
ADD COLUMN     "capacity_used" INTEGER,
ADD COLUMN     "delegation_id" TEXT,
ADD COLUMN     "depth" INTEGER,
ADD COLUMN     "parent_delegation_id" TEXT;

-- AlterTable
ALTER TABLE "authorisation" ADD COLUMN     "max_depth" INTEGER NOT NULL DEFAULT 2;

-- AlterTable
ALTER TABLE "delegate" ADD COLUMN     "identity_type" "IdentityType" NOT NULL DEFAULT 'CLIENT_CREDENTIALS',
ADD COLUMN     "web_bot_auth_agent" TEXT;

-- AlterTable
ALTER TABLE "service" ADD COLUMN     "principal_actions_per_hour" INTEGER NOT NULL DEFAULT 300;

-- CreateTable
CREATE TABLE "delegation" (
    "id" TEXT NOT NULL,
    "mandate_id" TEXT NOT NULL,
    "delegate_id" TEXT NOT NULL,
    "parent_delegation_id" TEXT,
    "depth" INTEGER NOT NULL,
    "label" TEXT,
    "capabilities" TEXT[],
    "assurance" "Assurance" NOT NULL,
    "status" "DelegationStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delegation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capacity_use" (
    "id" TEXT NOT NULL,
    "principal_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "mandate_id" TEXT NOT NULL,
    "delegation_id" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capacity_use_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "step_up" (
    "id" TEXT NOT NULL,
    "mandate_id" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "user_code" TEXT NOT NULL,
    "status" "StepUpStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMP(3),
    "used_at" TIMESTAMP(3),

    CONSTRAINT "step_up_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "delegation_mandate_id_idx" ON "delegation"("mandate_id");

-- CreateIndex
CREATE INDEX "capacity_use_principal_id_service_id_at_idx" ON "capacity_use"("principal_id", "service_id", "at");

-- CreateIndex
CREATE UNIQUE INDEX "step_up_user_code_key" ON "step_up"("user_code");

-- CreateIndex
CREATE INDEX "step_up_mandate_id_capability_status_idx" ON "step_up"("mandate_id", "capability", "status");

-- CreateIndex
CREATE UNIQUE INDEX "delegate_web_bot_auth_agent_key" ON "delegate"("web_bot_auth_agent");

-- AddForeignKey
ALTER TABLE "delegation" ADD CONSTRAINT "delegation_mandate_id_fkey" FOREIGN KEY ("mandate_id") REFERENCES "authorisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegation" ADD CONSTRAINT "delegation_delegate_id_fkey" FOREIGN KEY ("delegate_id") REFERENCES "delegate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegation" ADD CONSTRAINT "delegation_parent_delegation_id_fkey" FOREIGN KEY ("parent_delegation_id") REFERENCES "delegation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "step_up" ADD CONSTRAINT "step_up_mandate_id_fkey" FOREIGN KEY ("mandate_id") REFERENCES "authorisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;


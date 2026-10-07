-- CreateEnum
CREATE TYPE "DelegateType" AS ENUM ('PERSON', 'ORGANISATION', 'SOFTWARE_AGENT');

-- CreateEnum
CREATE TYPE "DelegateStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AuthorisationStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "Decision" AS ENUM ('ALLOW', 'DENY');

-- CreateEnum
CREATE TYPE "Lane" AS ENUM ('AUTHENTICATED_HUMAN', 'AUTHORISED_AGENT', 'UNTRUSTED');

-- CreateEnum
CREATE TYPE "Reason" AS ENUM ('VALID_AUTHORISATION', 'PERMISSION_MISSING', 'AUTHORISATION_REVOKED', 'AUTHORISATION_EXPIRED', 'UNKNOWN_DELEGATE', 'INVALID_AGENT_AUTHENTICATION', 'NO_AUTHORISATION', 'RATE_LIMITED', 'HUMAN_SESSION');

-- CreateTable
CREATE TABLE "principal" (
    "id" TEXT NOT NULL,
    "one_login_subject_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "principal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delegate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DelegateType" NOT NULL,
    "provider" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "client_secret_hash" TEXT NOT NULL,
    "status" "DelegateStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delegate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capability" (
    "id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "risk_level" "RiskLevel" NOT NULL,
    "requires_step_up" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "capability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "authorisation_request" (
    "id" TEXT NOT NULL,
    "principal_hint" TEXT,
    "principal_id" TEXT,
    "delegate_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "responded_at" TIMESTAMP(3),
    "authorisation_id" TEXT,

    CONSTRAINT "authorisation_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "authorisation_request_permission" (
    "authorisation_request_id" TEXT NOT NULL,
    "capability_id" TEXT NOT NULL,

    CONSTRAINT "authorisation_request_permission_pkey" PRIMARY KEY ("authorisation_request_id","capability_id")
);

-- CreateTable
CREATE TABLE "authorisation" (
    "id" TEXT NOT NULL,
    "principal_id" TEXT NOT NULL,
    "delegate_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "status" "AuthorisationStatus" NOT NULL DEFAULT 'ACTIVE',
    "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "authorisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "authorisation_permission" (
    "authorisation_id" TEXT NOT NULL,
    "capability_id" TEXT NOT NULL,

    CONSTRAINT "authorisation_permission_pkey" PRIMARY KEY ("authorisation_id","capability_id")
);

-- CreateTable
CREATE TABLE "activity_event" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lane" "Lane" NOT NULL,
    "principal_id" TEXT,
    "delegate_id" TEXT,
    "authorisation_id" TEXT,
    "service_id" TEXT,
    "capability" TEXT,
    "presented_client_id" TEXT,
    "decision" "Decision" NOT NULL,
    "reason" "Reason" NOT NULL,
    "request_id" TEXT NOT NULL,

    CONSTRAINT "activity_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "principal_one_login_subject_id_key" ON "principal"("one_login_subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "delegate_client_id_key" ON "delegate"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_slug_key" ON "service"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "capability_service_id_code_key" ON "capability"("service_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "authorisation_request_authorisation_id_key" ON "authorisation_request"("authorisation_id");

-- CreateIndex
CREATE INDEX "authorisation_principal_id_delegate_id_service_id_idx" ON "authorisation"("principal_id", "delegate_id", "service_id");

-- CreateIndex
CREATE INDEX "activity_event_timestamp_idx" ON "activity_event"("timestamp");

-- AddForeignKey
ALTER TABLE "capability" ADD CONSTRAINT "capability_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authorisation_request" ADD CONSTRAINT "authorisation_request_principal_id_fkey" FOREIGN KEY ("principal_id") REFERENCES "principal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authorisation_request" ADD CONSTRAINT "authorisation_request_delegate_id_fkey" FOREIGN KEY ("delegate_id") REFERENCES "delegate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authorisation_request" ADD CONSTRAINT "authorisation_request_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authorisation_request" ADD CONSTRAINT "authorisation_request_authorisation_id_fkey" FOREIGN KEY ("authorisation_id") REFERENCES "authorisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authorisation_request_permission" ADD CONSTRAINT "authorisation_request_permission_authorisation_request_id_fkey" FOREIGN KEY ("authorisation_request_id") REFERENCES "authorisation_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authorisation_request_permission" ADD CONSTRAINT "authorisation_request_permission_capability_id_fkey" FOREIGN KEY ("capability_id") REFERENCES "capability"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authorisation" ADD CONSTRAINT "authorisation_principal_id_fkey" FOREIGN KEY ("principal_id") REFERENCES "principal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authorisation" ADD CONSTRAINT "authorisation_delegate_id_fkey" FOREIGN KEY ("delegate_id") REFERENCES "delegate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authorisation" ADD CONSTRAINT "authorisation_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authorisation_permission" ADD CONSTRAINT "authorisation_permission_authorisation_id_fkey" FOREIGN KEY ("authorisation_id") REFERENCES "authorisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authorisation_permission" ADD CONSTRAINT "authorisation_permission_capability_id_fkey" FOREIGN KEY ("capability_id") REFERENCES "capability"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_event" ADD CONSTRAINT "activity_event_principal_id_fkey" FOREIGN KEY ("principal_id") REFERENCES "principal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_event" ADD CONSTRAINT "activity_event_delegate_id_fkey" FOREIGN KEY ("delegate_id") REFERENCES "delegate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_event" ADD CONSTRAINT "activity_event_authorisation_id_fkey" FOREIGN KEY ("authorisation_id") REFERENCES "authorisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_event" ADD CONSTRAINT "activity_event_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

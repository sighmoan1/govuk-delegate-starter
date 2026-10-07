-- AlterTable
ALTER TABLE "authorisation_request" ADD COLUMN     "initiated_by_service_id" TEXT,
ADD COLUMN     "requested_assurance" "Assurance",
ADD COLUMN     "user_code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "authorisation_request_user_code_key" ON "authorisation_request"("user_code");


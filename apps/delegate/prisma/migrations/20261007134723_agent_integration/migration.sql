-- AlterTable
ALTER TABLE "authorisation_request" ADD COLUMN     "return_url" TEXT;

-- AlterTable
ALTER TABLE "delegate" ADD COLUMN     "redirect_uris" TEXT[];

-- CreateTable
CREATE TABLE "agent_conversation" (
    "id" TEXT NOT NULL,
    "messages" JSONB NOT NULL DEFAULT '[]',
    "principal_id" TEXT,
    "pending_request_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_conversation_pkey" PRIMARY KEY ("id")
);

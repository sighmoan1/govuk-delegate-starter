CREATE TABLE "research_workspace" (
    "id" TEXT NOT NULL,
    "protocol_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "research_workspace_pkey" PRIMARY KEY ("id")
);

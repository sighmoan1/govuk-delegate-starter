import { PrismaClient } from "@/generated/prisma";

// Own generated client and database; never import HMRC or Delegate storage.
const g = globalThis as unknown as { observatoryPrisma?: PrismaClient };
export const prisma = g.observatoryPrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.observatoryPrisma = prisma;

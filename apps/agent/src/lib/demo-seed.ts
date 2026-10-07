// Example AI's demo starting state: an empty conversation, and optionally an
// existing connection to HMRC for Sam (when Delegate was reset "with access").
import type { PrismaClient } from "@/generated/prisma";

export async function seedDemo(prisma: PrismaClient, connection?: { principalId: string; granted: string[] }) {
  await prisma.message.deleteMany();
  await prisma.connection.deleteMany();
  if (connection) {
    await prisma.connection.create({
      data: { id: "hmrc", principalId: connection.principalId, granted: connection.granted, connectedAt: new Date() },
    });
  }
}

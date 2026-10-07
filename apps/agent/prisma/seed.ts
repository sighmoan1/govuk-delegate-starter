import { PrismaClient } from "../src/generated/prisma";

// Example AI starts the demo knowing nothing: no conversation, not connected to HMRC.
const prisma = new PrismaClient();
async function main() {
  await prisma.message.deleteMany();
  await prisma.connection.deleteMany();
  console.log("Cleared Example AI: empty conversation, no connections.");
}
main().finally(() => prisma.$disconnect());

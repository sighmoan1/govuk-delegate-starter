import { PrismaClient } from "../src/generated/prisma";
import { seedDemo } from "../src/lib/demo-seed";

// Example AI starts the demo knowing nothing: no conversation, not connected to HMRC.
const prisma = new PrismaClient();
async function main() {
  await seedDemo(prisma);
  console.log("Cleared Example AI: empty conversation, no connections.");
}
main().finally(() => prisma.$disconnect());

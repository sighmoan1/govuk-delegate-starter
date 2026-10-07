import { PrismaClient } from "../src/generated/prisma";
import { seedDemo } from "../src/lib/demo-seed";

const prisma = new PrismaClient();

async function main() {
  if (process.argv.includes("--if-empty") && (await prisma.taxpayer.count()) > 0) {
    console.log("HMRC database already seeded; leaving it alone.");
    return;
  }
  await seedDemo(prisma);
  console.log("Seeded HMRC: Sam's record and a day of traffic history.");
}

main().finally(() => prisma.$disconnect());

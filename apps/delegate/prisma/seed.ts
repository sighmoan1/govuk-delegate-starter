import { PrismaClient } from "../src/generated/prisma";
import { seedDemo } from "../src/lib/demo-seed";

const prisma = new PrismaClient();

async function main() {
  if (process.argv.includes("--if-empty") && (await prisma.principal.count()) > 0) {
    console.log("Database already seeded; leaving it alone.");
    return;
  }
  await seedDemo(prisma, { withAuthority: process.argv.includes("--with-authority") });
  console.log("Seeded: 1 principal, Personal assistant, HMRC, 8 capabilities, history events.");
}

main().finally(() => prisma.$disconnect());

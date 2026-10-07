import { PrismaClient } from "../src/generated/prisma";

// Example AI starts the demo knowing nobody: no runs, no flood results.
const prisma = new PrismaClient();
async function main() {
  await prisma.step.deleteMany();
  await prisma.run.deleteMany();
  await prisma.floodResult.deleteMany();
  console.log("Cleared Example AI: no runs, no flood results.");
}
main().finally(() => prisma.$disconnect());

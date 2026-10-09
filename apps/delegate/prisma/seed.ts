import { PrismaClient } from "../src/generated/prisma";
import { readFile } from "node:fs/promises";
import { POST as registerCatalogue } from "../src/app/api/services/[slug]/catalogues/route";
import { hashSecret } from "../src/lib/secrets";
import { seedDemo } from "../src/lib/demo-seed";

const prisma = new PrismaClient();

async function main() {
  // Local bootstrap calls the authenticated API handler with the service-owned
  // artifact. It works before the HTTP server starts, with the same validation,
  // credential checks, immutable versioning and replay response as network callers.
  const file = process.env.SERVICE_CATALOGUE_FILE ?? new URL("../../hmrc/service-catalogue.json", import.meta.url);
  const document = JSON.parse(await readFile(file, "utf8"));
  const key = process.env.HMRC_SERVICE_KEY ?? "dev-hmrc-service-key";
  await prisma.service.upsert({where:{slug:document.service},update:{},create:{slug:document.service,name:process.env.DEMO_SERVICE_NAME ?? "HMRC",apiKeyHash:hashSecret(key)}});
  const response = await registerCatalogue(new Request("http://bootstrap/api/services/"+document.service+"/catalogues",{method:"POST",headers:{"content-type":"application/json","x-service-key":key},body:JSON.stringify(document)}),{params:Promise.resolve({slug:document.service})});
  if(!response.ok) throw new Error(`Catalogue registration failed: ${response.status} ${await response.text()}`);
  console.log(`Registered service catalogue: ${await response.text()}`);
  if(process.argv.includes("--catalogue-only")) return;
  if (process.argv.includes("--if-empty") && (await prisma.principal.count()) > 0) {
    console.log("Database already seeded; leaving it alone.");
    return;
  }
  await seedDemo(prisma, { withAuthority: process.argv.includes("--with-authority") });
  console.log("Seeded: 1 principal, Personal assistant, HMRC, 8 capabilities, history events.");
}

main().finally(async () => { await prisma.$disconnect(); const { prisma: apiClient } = await import("../src/lib/db"); await apiClient.$disconnect(); });

import { prisma } from "@/lib/db";
import { healthResponse } from "@/lib/health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  // Access the migrated table: database connectivity alone is not readiness.
  return healthResponse(async () => {
    await prisma.researchWorkspace.count();
    await prisma.experimentAnalysis.count();
  });
}

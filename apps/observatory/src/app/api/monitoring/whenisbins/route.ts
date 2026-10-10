import { prisma } from "@/lib/db";
import { researchRoute } from "@/lib/research-http";
import { whenisbinsEvidence } from "@/lib/whenisbins";
export const dynamic = "force-dynamic";
export const GET = researchRoute("collection", async () => {
  const rows = await prisma.observedEvent.findMany({ where: { sourceService: "whenisbins_connector" }, orderBy: { receivedAt: "desc" }, take: 500, select: { snapshot: true } });
  return whenisbinsEvidence(rows.map(row => row.snapshot));
});

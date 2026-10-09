import { researchRoute } from "@/lib/research-http";
import { listClassifications } from "@/lib/classification-store";
export const dynamic = "force-dynamic";
export const GET = researchRoute("collection", async () => listClassifications());

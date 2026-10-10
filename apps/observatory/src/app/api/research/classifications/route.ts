import { researchBody, researchRoute } from "@/lib/research-http";
import { runClassification } from "@/lib/classification-store";
export const dynamic = "force-dynamic";
export const POST = researchRoute("collection", async req => runClassification(await researchBody(req)));

import { researchBody, researchRoute } from "@/lib/research-http";
import { createAttempt } from "@/lib/research-store";
export const dynamic = "force-dynamic";
export const POST = researchRoute("evaluation", async req => createAttempt(await researchBody(req)));

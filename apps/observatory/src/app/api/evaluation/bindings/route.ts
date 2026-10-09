import { researchBody, researchRoute } from "@/lib/research-http";
import { bindEvent } from "@/lib/research-store";
export const dynamic = "force-dynamic";
export const POST = researchRoute("evaluation", async req => bindEvent(await researchBody(req)));

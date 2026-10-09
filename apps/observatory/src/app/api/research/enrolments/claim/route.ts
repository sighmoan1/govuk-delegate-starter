import { researchBody, researchRoute } from "@/lib/research-http";
import { claimEnrolment } from "@/lib/research-store";
export const dynamic = "force-dynamic";
export const POST = researchRoute("collection", async req => claimEnrolment(await researchBody(req)));

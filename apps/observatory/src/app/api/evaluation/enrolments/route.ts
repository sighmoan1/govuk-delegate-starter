import { researchBody, researchRoute } from "@/lib/research-http";
import { createEnrolment } from "@/lib/research-store";
export const dynamic = "force-dynamic";
export const POST = researchRoute("evaluation", async req => createEnrolment(await researchBody(req)));

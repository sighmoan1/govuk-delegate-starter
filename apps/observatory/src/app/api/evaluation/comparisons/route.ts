import { researchBody, researchRoute } from "../../../../lib/research-http";
import { comparisons, runComparison } from "../../../../lib/workbench";
export const dynamic = "force-dynamic";
export const GET = researchRoute("evaluation", async () => comparisons());
export const POST = researchRoute("evaluation", async req => runComparison(await researchBody(req)));

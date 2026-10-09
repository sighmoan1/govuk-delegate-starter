import { researchBody, researchRoute } from "@/lib/research-http";
import { verifyAttempt } from "@/lib/research-store";
export const dynamic = "force-dynamic";
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return researchRoute("evaluation", async r => verifyAttempt((await ctx.params).id, await researchBody(r)))(req);
}

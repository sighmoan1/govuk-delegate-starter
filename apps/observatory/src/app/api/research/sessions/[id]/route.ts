import { researchRoute } from "@/lib/research-http";
import { activeSession } from "@/lib/research-store";
export const dynamic = "force-dynamic";
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return researchRoute("collection", async () => activeSession((await ctx.params).id))(req);
}

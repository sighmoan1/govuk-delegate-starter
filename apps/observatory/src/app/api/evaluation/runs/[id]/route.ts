import { researchRoute } from "@/lib/research-http";
import { prisma } from "@/lib/db";
import { uuid } from "@/lib/ground-truth";
export const dynamic = "force-dynamic";
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return researchRoute("evaluation", async () => { await prisma.researchRun.deleteMany({ where: { id: uuid((await ctx.params).id) } }); return { deleted: true }; })(req);
}

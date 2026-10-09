import { researchRoute, researchBody } from "@/lib/research-http";
import { prisma } from "@/lib/db";
import { fields, object, ResearchError, uuid } from "@/lib/ground-truth";
export const dynamic = "force-dynamic";
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return researchRoute("evaluation", async r => {
    const body = object(await researchBody(r)); fields(body, ['expected_attempts']);
    if (!Number.isInteger(body.expected_attempts) || Number(body.expected_attempts) < 1) throw new ResearchError('INVALID_ATTEMPT_DENOMINATOR');
    const id = uuid((await ctx.params).id);
    const run = await prisma.researchRun.findUnique({ where: { id }, include: { attempts: { include: { bindings: true } } } });
    if (!run) throw new ResearchError('RUN_NOT_FOUND',404);
    if (run.status !== 'OPEN' || run.attempts.length !== body.expected_attempts || run.attempts.some(a => !a.bindings.length || (run.mode === 'CONTROLLED' ? a.status !== 'VERIFIED' : a.status !== 'UNLABELLED'))) throw new ResearchError('INCOMPLETE_OR_ALREADY_FINAL_RUN',409);
    await prisma.researchRun.update({ where: { id }, data: { status: 'COMPLETED' } });
    return { run_id: id, status: 'COMPLETED', attempts: run.attempts.length };
  })(req);
}

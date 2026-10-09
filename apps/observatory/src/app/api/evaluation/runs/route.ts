import { researchBody, researchRoute } from "@/lib/research-http";
import { createRun } from "@/lib/research-store";
import { prisma } from "@/lib/db";
export const dynamic = "force-dynamic";
export const POST = researchRoute("evaluation", async req => createRun(await researchBody(req)));
export const GET = researchRoute("evaluation", async () => prisma.researchRun.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { attempts: { include: { bindings: true } } } }));

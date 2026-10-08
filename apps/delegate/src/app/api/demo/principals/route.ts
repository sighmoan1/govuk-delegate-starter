import { NextResponse } from "next/server";
import { demoAllowed } from "@/lib/demo-gate";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { AUTHORISATION_DAYS } from "@/lib/config";

// Demo tooling, not part of the service: N separate people, each of whom has
// given one agent permission. Used by the "100 people" swarm arm. Not reachable
// through the public tunnel.
export async function POST(req: Request) {
  if (!demoAllowed(req)) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  const b = (await req.json().catch(() => ({}))) as { n?: number; client_id?: string; capabilities?: string[] };
  const n = Math.min(Math.max(Number(b.n) || 10, 1), 200);
  const delegate = await prisma.delegate.findUniqueOrThrow({ where: { clientId: b.client_id ?? "demo-personal-agent" } });
  const service = await prisma.service.findUniqueOrThrow({ where: { slug: "hmrc-personal-tax" }, include: { capabilities: true } });
  const codes = b.capabilities ?? ["view_tax_code", "claim_job_expenses"];
  const caps = service.capabilities.filter((c) => codes.includes(c.code));
  const now = Date.now();
  const people = [];
  for (let i = 0; i < n; i++) {
    const p = await prisma.principal.create({ data: { oneLoginSubjectId: `urn:fdc:gov.uk:2022:swarm-${randomUUID()}`, displayName: `Person ${i + 1}` } });
    const auth = await prisma.authorisation.create({
      data: {
        principalId: p.id, delegateId: delegate.id, serviceId: service.id, validFrom: new Date(now - 60_000), validUntil: new Date(now + AUTHORISATION_DAYS * 86_400_000),
        permissions: { create: caps.map((c) => ({ capabilityId: c.id })) },
      },
    });
    await prisma.delegation.create({ data: { mandateId: auth.id, delegateId: delegate.id, depth: 0, capabilities: caps.map((c) => c.code), assurance: "REGISTERED" } });
    people.push({ principal_id: p.id, subject: p.oneLoginSubjectId });
  }
  return NextResponse.json({ people });
}

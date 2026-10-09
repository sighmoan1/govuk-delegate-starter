import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { expireDueAuthorisations } from "@/lib/authority";
import { principalFromRequest } from "@/lib/session";
import { unauthenticated } from "@/lib/http";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const principal = await principalFromRequest(req);
  if (!principal) return unauthenticated();
  await expireDueAuthorisations();
  const a = await prisma.authorisation.findUnique({
    where: { id: (await params).id },
    include: { delegate: true, service: true, permissions: { include: { capability: true } } },
  });
  if (!a || a.principalId !== principal.id) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({
    id: a.id,
    delegate: { id: a.delegateId, name: a.delegate.name, type: a.delegate.type },
    service: a.service.slug,
    status: a.status,
    valid_from: a.validFrom,
    valid_until: a.validUntil,
    revoked_at: a.revokedAt,
    constraints:a.constraints ?? {},
    capabilities: a.permissions.map((p) => p.capability.code),
  });
}

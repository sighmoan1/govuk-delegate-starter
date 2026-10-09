import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { expireDueAuthorisations } from "@/lib/authority";
import { principalFromRequest } from "@/lib/session";
import { unauthenticated } from "@/lib/http";

export async function GET(req: Request) {
  const principal = await principalFromRequest(req);
  if (!principal) return unauthenticated();
  await expireDueAuthorisations();
  const rows = await prisma.authorisation.findMany({
    where: { principalId: principal.id },
    include: { delegate: true, service: true, permissions: { include: { capability: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({
    authorisations: rows.map((a) => ({
      id: a.id,
      delegate: a.delegate.name,
      service: a.service.slug,
      status: a.status,
      valid_until: a.validUntil,
      constraints:a.constraints ?? {},
      capabilities: a.permissions.map((p) => p.capability.code),
    })),
  });
}

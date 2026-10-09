import { NextResponse } from "next/server";
import { bearer, verifyPresenterToken } from "@/lib/agent-auth";
import { prisma } from "@/lib/db";
import { subDelegate } from "@/lib/delegations";
import { fail, readJson, unauthenticated } from "@/lib/http";

// POST /api/delegations — an agent (or sub-agent) passes part of its authority on.
export async function POST(req: Request) {
  const token = bearer(req);
  const presenter = token ? await verifyPresenterToken(token) : null;
  if (!presenter) return unauthenticated("agent");
  if (presenter.kind === "agent") {
    const d = await prisma.delegate.findUnique({ where: { id: presenter.delegateId } });
    if (!d || d.status !== "ACTIVE") return unauthenticated("agent");
  }
  try {
    const b = await readJson(req);
    const { delegation, token: childToken } = await subDelegate({
      parent: presenter.kind === "agent" ? { kind: "agent", delegateId: presenter.delegateId } : presenter,
      constraints: b.constraints,
      principalId: String(b.principal_id ?? ""),
      service: String(b.service ?? ""),
      capabilities: Array.isArray(b.capabilities) ? b.capabilities.map(String) : [],
      label: b.label ? String(b.label) : undefined,
    });
    return NextResponse.json(
      {
        delegation_id: delegation.id,
        parent_delegation_id: delegation.parentDelegationId,
        mandate_id: delegation.mandateId,
        depth: delegation.depth,
        capabilities: delegation.capabilities,
        constraints: delegation.constraints ?? {},
        token: childToken,
      },
      { status: 201 },
    );
  } catch (e) {
    return fail(e);
  }
}

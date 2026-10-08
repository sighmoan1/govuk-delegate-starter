import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifySecretCached } from "@/lib/secrets";
import { readJson } from "@/lib/http";

/**
 * A service records what an agent did in a person's name, in the agent's own
 * words, so the person can see it on GOV.UK.
 *
 *   POST /api/receipts     x-service-key
 *   { service, mandate_id, delegation_id, capability, reference, text, agent_confirmed }
 */
export async function POST(req: Request) {
  const b = await readJson(req);
  const service = await prisma.service.findUnique({ where: { slug: String(b.service ?? "") } });
  const key = req.headers.get("x-service-key") ?? "";
  if (!service || !key || !verifySecretCached(key, service.apiKeyHash)) return NextResponse.json({ error: "INVALID_SERVICE_AUTHENTICATION" }, { status: 401 });

  const mandate = await prisma.authorisation.findUnique({ where: { id: String(b.mandate_id ?? "") } });
  if (!mandate || mandate.serviceId !== service.id) {
    return NextResponse.json({ error: "NO_SUCH_MANDATE" }, { status: 404 });
  }
  const r = await prisma.receipt.create({
    data: {
      principalId: mandate.principalId, mandateId: mandate.id, delegationId: b.delegation_id ? String(b.delegation_id) : null,
      delegateId: mandate.delegateId, serviceId: service.id, capability: String(b.capability ?? ""),
      reference: String(b.reference ?? ""), text: String(b.text ?? "").slice(0, 1000), agentConfirmed: b.agent_confirmed === true,
    },
  });
  return NextResponse.json({ receipt_id: r.id }, { status: 201 });
}

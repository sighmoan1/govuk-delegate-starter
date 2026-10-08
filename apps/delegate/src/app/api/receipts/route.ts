import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifySecretCached } from "@/lib/secrets";
import { readJson } from "@/lib/http";

/**
 * A service records what an agent did in a person's name, in the agent's own
 * words, so the person can see it on GOV.UK.
 *
 *   POST /api/receipts     x-service-key
 *   { service, mandate_id, delegation_id, capability, reference, text, agent_confirmed, idempotency_key }
 *
 * With an idempotency_key, repeating the write returns the receipt already made (200)
 * instead of creating another (201).
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
  const idempotencyKey = b.idempotency_key ? `${service.id}:${String(b.idempotency_key).slice(0, 200)}` : null;
  if (idempotencyKey) {
    const existing = await prisma.receipt.findUnique({ where: { idempotencyKey } });
    if (existing) return NextResponse.json({ receipt_id: existing.id, duplicate: true }, { status: 200 });
  }
  const data = {
    data: {
      principalId: mandate.principalId, mandateId: mandate.id, delegationId: b.delegation_id ? String(b.delegation_id) : null,
      delegateId: mandate.delegateId, serviceId: service.id, capability: String(b.capability ?? ""),
      reference: String(b.reference ?? ""), text: String(b.text ?? "").slice(0, 1000), agentConfirmed: b.agent_confirmed === true, idempotencyKey,
    },
  };
  try {
    const r = await prisma.receipt.create(data);
    return NextResponse.json({ receipt_id: r.id }, { status: 201 });
  } catch (e) {
    // Two identical writes raced: the loser returns the winner's receipt.
    if (idempotencyKey && (e as { code?: string }).code === "P2002") {
      const existing = await prisma.receipt.findUniqueOrThrow({ where: { idempotencyKey } });
      return NextResponse.json({ receipt_id: existing.id, duplicate: true }, { status: 200 });
    }
    throw e;
  }
}

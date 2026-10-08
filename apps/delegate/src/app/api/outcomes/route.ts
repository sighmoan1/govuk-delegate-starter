import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serviceFromRequest } from "@/lib/service-auth";
import { readJson } from "@/lib/http";
import { OUTCOME_STATUSES } from "@/lib/outcomes";
import type { OutcomeStatus } from "@/generated/prisma";

/**
 * A service reports what happened after Delegate said yes. Authority checking
 * is not execution: this is where "submitted", "failed" or "completed" is recorded.
 *
 *   POST /api/outcomes     x-service-key
 *   { service, check_id, status, reference?, reason?, idempotency_key?, occurred_at? }
 *
 * The check_id must be an ALLOW this service received. Person, mandate,
 * delegation and capability come from that check, never from the caller.
 * Reporting is idempotent per (service, idempotency_key; default check_id:status),
 * and rows are only ever added.
 */
export async function POST(req: Request) {
  const b = await readJson(req);
  const service = await serviceFromRequest(req, String(b.service ?? ""));
  if (!service) return NextResponse.json({ error: "INVALID_SERVICE_AUTHENTICATION" }, { status: 401 });

  const status = String(b.status ?? "") as OutcomeStatus;
  if (!(OUTCOME_STATUSES as readonly string[]).includes(status)) return NextResponse.json({ error: "INVALID_STATUS" }, { status: 400 });

  const check = await prisma.activityEvent.findUnique({ where: { id: String(b.check_id ?? "") } });
  if (!check || check.serviceId !== service.id || check.decision !== "ALLOW" || !check.authorisationId || !check.principalId || !check.delegateId) {
    return NextResponse.json({ error: "NO_SUCH_CHECK" }, { status: 404 });
  }

  const idempotencyKey = String(b.idempotency_key ?? `${check.id}:${status}`).slice(0, 200);
  const existing = () => prisma.transactionOutcome.findUnique({ where: { serviceId_idempotencyKey: { serviceId: service.id, idempotencyKey } } });
  const seen = await existing();
  if (seen) return NextResponse.json({ outcome_id: seen.id, duplicate: true });

  const when = b.occurred_at ? new Date(String(b.occurred_at)) : new Date();
  try {
    const o = await prisma.transactionOutcome.create({
      data: {
        idempotencyKey, checkId: check.id, principalId: check.principalId, mandateId: check.authorisationId, delegationId: check.delegationId,
        delegateId: check.delegateId, serviceId: service.id, capability: check.capability ?? "", status,
        reference: b.reference ? String(b.reference).slice(0, 100) : null,
        reason: b.reason ? String(b.reason).replace(/[^A-Za-z0-9_]/g, "").slice(0, 64) || null : null,
        occurredAt: isNaN(when.getTime()) ? new Date() : when,
      },
    });
    return NextResponse.json({ outcome_id: o.id, duplicate: false }, { status: 201 });
  } catch (e) {
    const raced = await existing(); // two deliveries at once: the loser sees the winner's row
    if (raced) return NextResponse.json({ outcome_id: raced.id, duplicate: true });
    throw e;
  }
}

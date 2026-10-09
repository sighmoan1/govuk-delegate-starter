import { NextResponse } from "next/server";
import { serviceFromRequest } from "@/lib/service-auth";
import { completeStepUp } from "@/lib/step-up-redeem";
import { readJson } from "@/lib/http";

/**
 * The service reports that it COMMITTED the operation the approval covers.
 *
 *   POST /api/step-ups/complete     x-service-key
 *   { service, proposal_id, reference? }
 *
 * Idempotent: reporting twice (a retry, a duplicate callback, recovery after a
 * crash) is a 200 with duplicate: true. The service calls this after its own
 * commit, and again whenever it answers a retry from its stored result.
 */
export async function POST(req: Request) {
  const b = await readJson(req);
  const service = await serviceFromRequest(req, String(b.service ?? ""));
  if (!service) return NextResponse.json({ error: "INVALID_SERVICE_AUTHENTICATION" }, { status: 401 });
  const r = await completeStepUp({ serviceId: service.id, proposalId: String(b.proposal_id ?? ""), reference: typeof b.reference === "string" ? b.reference : null });
  if (r.ok) return NextResponse.json({ state: r.state, duplicate: r.duplicate });
  return NextResponse.json({ error: r.reason, message: r.message }, { status: r.reason === "NOT_FOUND" ? 404 : 409 });
}

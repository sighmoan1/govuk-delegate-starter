import { NextResponse } from "next/server";
import { serviceFromRequest } from "@/lib/service-auth";
import { releaseStepUp } from "@/lib/step-up-redeem";
import { readJson } from "@/lib/http";

/**
 * The service did not commit the operation it reserved the approval for: give it back.
 *
 *   POST /api/step-ups/release     x-service-key
 *   { service, proposal_id, reservation_id }
 *
 * Only the reservation that holds the approval can release it. Best effort for
 * the service: if the call never arrives, the lease lapses on its own.
 */
export async function POST(req: Request) {
  const b = await readJson(req);
  const service = await serviceFromRequest(req, String(b.service ?? ""));
  if (!service) return NextResponse.json({ error: "INVALID_SERVICE_AUTHENTICATION" }, { status: 401 });
  const r = await releaseStepUp({ serviceId: service.id, proposalId: String(b.proposal_id ?? ""), reservationId: String(b.reservation_id ?? "") });
  return NextResponse.json({ released: r.released });
}

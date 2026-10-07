import { NextResponse } from "next/server";
import { checkAuthority } from "@/lib/authority";
import { config } from "@/lib/config";
import { safeEqual } from "@/lib/secrets";
import { readJson } from "@/lib/http";

// Relationship introspection for receiving services (HMRC-style lookup).
// Authenticated with the SERVICE's key — neither a principal's nor a delegate's.
export async function POST(req: Request) {
  const key = req.headers.get("x-service-key") ?? "";
  if (!safeEqual(key, config.dwpServiceKey)) {
    return NextResponse.json({ error: "INVALID_SERVICE_AUTHENTICATION" }, { status: 401 });
  }
  const b = await readJson(req);
  const result = await checkAuthority({
    principalId: String(b.principal_id ?? ""),
    delegateId: String(b.delegate_id ?? ""),
    service: String(b.service ?? ""),
    capability: String(b.capability ?? ""),
  });
  if (result.authorised) {
    return NextResponse.json({ authorised: true, authorisation_id: result.authorisationId, status: result.status });
  }
  return NextResponse.json({
    authorised: false,
    status: result.status ?? null,
    reason: result.reason,
    authorisation_id: result.authorisationId ?? null,
  });
}

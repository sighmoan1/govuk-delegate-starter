import { NextResponse } from "next/server";
import { approveRequest } from "@/lib/requests";
import { principalFromRequest } from "@/lib/session";
import { fail, readJson, unauthenticated } from "@/lib/http";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const principal = await principalFromRequest(req);
  if (!principal) return unauthenticated();
  try {
    const { id } = await params;
    const body = await readJson(req);
    const caps = Array.isArray(body.capabilities) ? body.capabilities.map(String) : undefined;
    const auth = await approveRequest(id, principal.id, caps);
    return NextResponse.json({ authorisation_id: auth.id, status: auth.status, valid_until: auth.validUntil }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}

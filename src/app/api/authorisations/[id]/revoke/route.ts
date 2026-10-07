import { NextResponse } from "next/server";
import { revokeAuthorisation } from "@/lib/requests";
import { principalFromRequest } from "@/lib/session";
import { fail, unauthenticated } from "@/lib/http";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const principal = await principalFromRequest(req);
  if (!principal) return unauthenticated();
  try {
    const a = await revokeAuthorisation((await params).id, principal.id);
    return NextResponse.json({ id: a.id, status: a.status, revoked_at: a.revokedAt });
  } catch (e) {
    return fail(e);
  }
}

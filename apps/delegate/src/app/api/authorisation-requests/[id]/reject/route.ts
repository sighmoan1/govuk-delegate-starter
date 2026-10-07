import { NextResponse } from "next/server";
import { rejectRequest } from "@/lib/requests";
import { principalFromRequest } from "@/lib/session";
import { fail, unauthenticated } from "@/lib/http";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const principal = await principalFromRequest(req);
  if (!principal) return unauthenticated();
  try {
    const r = await rejectRequest((await params).id, principal.id);
    return NextResponse.json({ id: r.id, status: r.status });
  } catch (e) {
    return fail(e);
  }
}

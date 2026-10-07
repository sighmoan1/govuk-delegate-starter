import { NextResponse } from "next/server";
import { delegateFromRequest } from "@/lib/agent-auth";
import { loadRequest, requestJson } from "@/lib/requests";
import { principalFromRequest } from "@/lib/session";
import { unauthenticated } from "@/lib/http";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const delegate = await delegateFromRequest(req);
  const principal = delegate ? null : await principalFromRequest(req);
  if (!delegate && !principal) return unauthenticated("agent");
  const r = await loadRequest(id);
  const visible = r && (delegate ? r.delegateId === delegate.id : !r.principalId || r.principalId === principal!.id);
  if (!r || !visible) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json(requestJson(r));
}

import { NextResponse } from "next/server";
import { delegateFromRequest } from "@/lib/agent-auth";
import { cancelRequest } from "@/lib/requests";
import { fail, unauthenticated } from "@/lib/http";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const delegate = await delegateFromRequest(req);
  if (!delegate) return unauthenticated("agent");
  try {
    const r = await cancelRequest((await params).id, delegate.id);
    return NextResponse.json({ id: r.id, status: r.status });
  } catch (e) {
    return fail(e);
  }
}

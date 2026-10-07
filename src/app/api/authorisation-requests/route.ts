import { NextResponse } from "next/server";
import { delegateFromRequest } from "@/lib/agent-auth";
import { createRequest, requestJson, DomainError } from "@/lib/requests";
import { fail, readJson, unauthenticated } from "@/lib/http";
import { config } from "@/lib/config";

// A delegate asks to act for someone. Nothing is granted by asking.
export async function POST(req: Request) {
  const delegate = await delegateFromRequest(req);
  if (!delegate) return unauthenticated("agent");
  try {
    const body = await readJson(req);
    if (!Array.isArray(body.capabilities)) throw new DomainError("INVALID_BODY", "capabilities must be an array");
    const created = await createRequest({
      delegateId: delegate.id,
      service: String(body.service ?? ""),
      capabilities: body.capabilities.map(String),
      principalHint: body.principal_hint ? String(body.principal_hint) : undefined,
    });
    return NextResponse.json(
      { ...requestJson(created), approval_url: `${config.appUrl}/requests/${created.id}` },
      { status: 201 },
    );
  } catch (e) {
    return fail(e);
  }
}

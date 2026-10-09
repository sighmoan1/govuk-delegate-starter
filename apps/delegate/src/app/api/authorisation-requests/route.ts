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
      constraints: body.constraints,
      catalogueVersion: body.catalogue_version,
      delegateId: delegate.id,
      service: String(body.service ?? ""),
      capabilities: body.capabilities.map(String),
      principalHint: body.principal_hint ? String(body.principal_hint) : undefined,
      returnUrl: body.return_url ? String(body.return_url) : undefined,
    });
    return NextResponse.json(
      { ...requestJson(created), consent_url: `${config.appUrl}/consent/${created.id}` },
      { status: 201 },
    );
  } catch (e) {
    return fail(e);
  }
}

import { NextResponse } from "next/server";
import { DomainError } from "./requests";

export function fail(e: unknown) {
  if (e instanceof DomainError) {
    return NextResponse.json({ error: e.code, message: e.message }, { status: e.httpStatus });
  }
  console.error(e);
  return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
}

export const unauthenticated = (what = "principal") =>
  NextResponse.json({ error: what === "principal" ? "NOT_SIGNED_IN" : "INVALID_AGENT_AUTHENTICATION" }, { status: 401 });

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  return (await req.json().catch(() => ({}))) as Record<string, unknown>;
}

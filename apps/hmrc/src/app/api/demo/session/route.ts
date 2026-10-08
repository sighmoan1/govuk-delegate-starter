import { NextResponse } from "next/server";
import { demoAllowed } from "@/lib/demo-gate";
import { findOrCreateTaxpayer } from "@/lib/taxpayers";
import { signSession, SESSION_COOKIE } from "@/lib/session";

// Demo tooling, not part of the service: an ordinary signed-in session for a
// person, as if an agent HMRC can't see were reusing their browser. Used by
// the "undetected sessions" swarm arm. Not reachable through the public tunnel.
export async function POST(req: Request) {
  if (!demoAllowed(req)) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  const { subject } = (await req.json().catch(() => ({}))) as { subject?: string };
  if (!subject) return NextResponse.json({ error: "SUBJECT_REQUIRED" }, { status: 400 });
  const taxpayer = await findOrCreateTaxpayer(subject);
  return NextResponse.json({ cookie: `${SESSION_COOKIE}=${await signSession(taxpayer.id)}` });
}

import { NextResponse } from "next/server";
import { findOrCreateTaxpayer } from "@/lib/taxpayers";
import { signSession, SESSION_COOKIE } from "@/lib/session";

// Demo tooling, not part of the service: an ordinary signed-in session for a
// person, as if an agent HMRC can't see were reusing their browser. Used by
// the "undetected sessions" swarm arm. Disabled in public mode.
export async function POST(req: Request) {
  if (process.env.PUBLIC_MODE === "true" || req.headers.get("x-demo-key") !== (process.env.DEMO_CONSOLE_KEY ?? "dev-demo-console-key")) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  const { subject } = (await req.json().catch(() => ({}))) as { subject?: string };
  if (!subject) return NextResponse.json({ error: "SUBJECT_REQUIRED" }, { status: 400 });
  const taxpayer = await findOrCreateTaxpayer(subject);
  return NextResponse.json({ cookie: `${SESSION_COOKIE}=${await signSession(taxpayer.id)}` });
}

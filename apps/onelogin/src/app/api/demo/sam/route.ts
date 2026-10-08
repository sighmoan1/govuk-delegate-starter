import { NextResponse } from "next/server";
import { demoAllowed } from "@/lib/demo-gate";
import { demoEmail, demoPassword, latestCode, PHONE_ENDING, strict } from "@/lib/flow";

// Demo tooling: what Sam knows and holds, for the "Sam's phone" page on the
// local about site. In real life these are in her head and on her phone, which
// is why an agent can't have them. Never reachable through the public tunnel.
export async function GET(req: Request) {
  if (!demoAllowed(req)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const sms = latestCode();
  return NextResponse.json({ strict: strict(), email: demoEmail(), password: demoPassword(), phone_ending: PHONE_ENDING, code: sms?.code ?? null, sent_at: sms ? new Date(sms.sentAt).toISOString() : null });
}

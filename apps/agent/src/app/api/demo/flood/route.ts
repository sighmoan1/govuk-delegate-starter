import { NextResponse } from "next/server";
import { demoAllowed } from "@/lib/demo-gate";
import { prisma } from "@/lib/db";
import { callHmrc, signInToDelegate } from "@/lib/gov";

// Demo tooling, not part of the product: the prototype's console asks Example AI
// to send a burst of requests to HMRC as itself, for Sam. Local use only.
export async function POST(req: Request) {
  if (!demoAllowed(req)) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  const { n = 40 } = (await req.json().catch(() => ({}))) as { n?: number };
  const count = Math.min(Math.max(Number(n) || 40, 1), 100);
  const conn = await prisma.connection.findUnique({ where: { id: "hmrc" } });
  const signin = await signInToDelegate();
  if (!conn?.principalId || !signin.token) {
    return NextResponse.json({ error: "NOT_CONNECTED", message: "Example AI is not connected to HMRC for Sam yet." }, { status: 409 });
  }
  const started = Date.now();
  const results = await Promise.all(
    Array.from({ length: count }, () => callHmrc("view_tax_code", { token: signin.token!, principalId: conn.principalId! })),
  );
  return NextResponse.json({
    n: count,
    statuses: results.map((r) => ({ status: r.exchange.status, reason: r.reason, ms: r.exchange.ms })),
    totalMs: Date.now() - started,
  });
}

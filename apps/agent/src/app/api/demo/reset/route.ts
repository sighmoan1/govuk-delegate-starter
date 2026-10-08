import { NextResponse } from "next/server";
import { demoAllowed } from "@/lib/demo-gate";
import { prisma } from "@/lib/db";
import { seedDemo } from "@/lib/demo-seed";

// Demo tooling, not part of the product: the about site's reset button.
export async function POST(req: Request) {
  if (!demoAllowed(req)) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  const body = (await req.json().catch(() => ({}))) as { principal_id?: string; granted?: string[] };
  await seedDemo(prisma, body.principal_id ? { principalId: body.principal_id, granted: body.granted ?? [] } : undefined);
  return NextResponse.json({ reset: true, connected: Boolean(body.principal_id) });
}

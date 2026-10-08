import { NextResponse } from "next/server";
import { demoAllowed } from "@/lib/demo-gate";
import { prisma } from "@/lib/db";
import { seedDemo } from "@/lib/demo-seed";

// Demo tooling, not part of the service: the about site's reset button.
export async function POST(req: Request) {
  if (!demoAllowed(req)) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  const body = (await req.json().catch(() => ({}))) as { withAuthority?: boolean };
  const result = await seedDemo(prisma, { withAuthority: Boolean(body.withAuthority) });
  return NextResponse.json({ principal_id: result.principalId, granted: result.granted });
}

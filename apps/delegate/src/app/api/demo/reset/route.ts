import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { seedDemo } from "@/lib/demo-seed";

// Demo tooling, not part of the service: the about site's reset button.
export async function POST(req: Request) {
  if (req.headers.get("x-demo-key") !== (process.env.DEMO_CONSOLE_KEY ?? "dev-demo-console-key")) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { withAuthority?: boolean };
  const result = await seedDemo(prisma, { withAuthority: Boolean(body.withAuthority) });
  return NextResponse.json({ principal_id: result.principalId, granted: result.granted });
}

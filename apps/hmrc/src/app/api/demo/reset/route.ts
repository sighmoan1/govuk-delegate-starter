import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { seedDemo } from "@/lib/demo-seed";
import { resetFriction } from "@/lib/friction";

// Demo tooling, not part of the service: the about site's reset button.
export async function POST(req: Request) {
  if (req.headers.get("x-demo-key") !== (process.env.DEMO_CONSOLE_KEY ?? "dev-demo-console-key")) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  await seedDemo(prisma);
  resetFriction();
  return NextResponse.json({ reset: true });
}

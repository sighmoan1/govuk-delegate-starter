import { NextResponse } from "next/server";
import { demoAllowed } from "@/lib/demo-gate";
import { prisma } from "@/lib/db";
import { seedDemo } from "@/lib/demo-seed";
import { resetFriction } from "@/lib/friction";

// Demo tooling, not part of the service: the about site's reset button.
export async function POST(req: Request) {
  if (!demoAllowed(req)) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  await seedDemo(prisma);
  resetFriction();
  return NextResponse.json({ reset: true });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// HMRC's own log, as data, for the tests and the agent's flood page. Synthetic.
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const since = new URL(req.url).searchParams.get("since");
  const events = await prisma.serviceEvent.findMany({
    where: since ? { timestamp: { gte: new Date(since) } } : undefined,
    orderBy: { timestamp: "desc" },
    take: 500,
  });
  return NextResponse.json({ events });
}

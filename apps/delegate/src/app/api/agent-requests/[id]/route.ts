import { NextResponse } from "next/server";
import { serviceFromRequest } from "@/lib/service-auth";
import { requestStatusForService } from "@/lib/agent-requests";

// The service polls: has the person decided?
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get("service") ?? "";
  const service = await serviceFromRequest(req, slug);
  if (!service) return NextResponse.json({ error: "INVALID_SERVICE_AUTHENTICATION" }, { status: 401 });
  const status = await requestStatusForService((await params).id, service.id);
  if (!status) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json(status);
}

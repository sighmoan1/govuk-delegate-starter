import { NextRequest, NextResponse } from "next/server";
import { publicBriefingDecision, publicBriefingMode } from "./lib/public-briefing";

export function middleware(request: NextRequest) {
  if (!publicBriefingMode()) return NextResponse.next();
  const decision = publicBriefingDecision(request.nextUrl.pathname, request.method);
  if (decision === "not-found") return new NextResponse("Not found", { status: 404 });
  if (decision === "method-not-allowed") return new NextResponse("Read-only briefing site", { status: 405, headers: { Allow: "GET, HEAD" } });
  if (decision === "redirect") return new NextResponse(null, { status: 307, headers: { Location: "/briefing" } });
  return NextResponse.next();
}
export const config = { matcher: "/:path*" };

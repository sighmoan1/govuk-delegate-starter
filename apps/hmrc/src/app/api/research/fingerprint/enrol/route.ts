import { NextResponse } from "next/server";
import { enrolResearch, researchEnabled, sameResearchOrigin, signResearch, RESEARCH_COOKIE } from "@/lib/fingerprint-research";

export async function POST(req: Request) {
  if (!researchEnabled()) return NextResponse.json({ state: "not_run" }, { status: 404 });
  if (!sameResearchOrigin(req)) return NextResponse.json({ error: "ORIGIN_REQUIRED" }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (body?.consent !== true) return NextResponse.json({ error: "OPT_IN_REQUIRED" }, { status: 400 });
  if (!process.env.NEXT_PUBLIC_FINGERPRINT_API_KEY?.trim()) return NextResponse.json({ state: "missing" }, { status: 503 });
  if (typeof body.enrollment_token !== "string" || !/^[A-Za-z0-9_-]{20,256}$/.test(body.enrollment_token)) return NextResponse.json({ error: "ENROLMENT_REQUIRED" }, { status: 400 });
  try {
    const binding = await enrolResearch(body.enrollment_token);
    const response = NextResponse.json({ session_id: binding.session_id, nonce: binding.nonce, expires_at: binding.expires_at });
    response.cookies.set(RESEARCH_COOKIE, await signResearch(binding), { httpOnly: true, secure: new URL(req.url).protocol === "https:",
      sameSite: "strict", path: "/", expires: new Date(binding.expires_at) });
    return response;
  } catch { return NextResponse.json({ state: "error", error: "RESEARCH_UNAVAILABLE" }, { status: 503 }); }
}

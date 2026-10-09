import { NextResponse } from "next/server";
import { parseSample } from "@/lib/fingerprint-coverage";
import { activeResearch, appendSensor, readResearch, researchEnabled, sameResearchOrigin, verifyVendor } from "@/lib/fingerprint-research";

export async function POST(req: Request) {
  if (!researchEnabled()) return NextResponse.json({ state: "not_run" }, { status: 404 });
  if (!sameResearchOrigin(req)) return NextResponse.json({ error: "ORIGIN_REQUIRED" }, { status: 403 });
  const binding = await readResearch(req);
  const body = await req.json().catch(() => null);
  if (!binding || body?.nonce !== binding.nonce) return NextResponse.json({ error: "ENROLMENT_REQUIRED" }, { status: 403 });
  const sample = parseSample(body?.sample);
  if (!sample) return NextResponse.json({ error: "INVALID_SAMPLE" }, { status: 400 });
  try {
    if (!await activeResearch(binding)) return NextResponse.json({ error: "ENROLMENT_INACTIVE" }, { status: 403 });
    const verification = await verifyVendor(sample, binding);
    if (verification === "verification_failed") return NextResponse.json({ error: "EVENT_BINDING_FAILED" }, { status: 403 });
    const observation_id = await appendSensor(sample, binding, verification);
    return NextResponse.json({ observation_id, state: sample.state, verification });
  } catch { return NextResponse.json({ state: "error", error: "RESEARCH_UNAVAILABLE" }, { status: 503 }); }
}

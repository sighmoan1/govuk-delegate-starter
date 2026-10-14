import { NextResponse } from "next/server";
import { parseSample } from "@/lib/fingerprint-coverage";
import { activeResearch, appendSensor, readResearch, researchEnabled, sameResearchOrigin, verifyVendor } from "@/lib/fingerprint-research";
import { botdSample, studyHttpEvidence } from '@/lib/auxiliary-sensors';

export async function POST(req: Request) {
  if (!researchEnabled()) return NextResponse.json({ state: "not_run" }, { status: 404 });
  if (!sameResearchOrigin(req)) return NextResponse.json({ error: "ORIGIN_REQUIRED" }, { status: 403 });
  const binding = await readResearch(req);
  const raw = await req.text();
  if (raw.length > 16384) return NextResponse.json({ error: 'BODY_TOO_LARGE' }, { status: 413 });
  const body = (() => { try { return JSON.parse(raw); } catch { return null; } })();
  if (!binding || body?.nonce !== binding.nonce) return NextResponse.json({ error: "ENROLMENT_REQUIRED" }, { status: 403 });
  const sample = parseSample(body?.sample);
  if (!sample) return NextResponse.json({ error: "INVALID_SAMPLE" }, { status: 400 });
  const botd = body.botd === undefined ? null : botdSample(body.botd);
  if (body.botd !== undefined && (!botd || process.env.BOTD_RESEARCH_ENABLED !== 'true')) return NextResponse.json({ error: 'INVALID_OR_DISABLED_AUXILIARY_SENSOR' }, { status: 400 });
  try {
    if (!await activeResearch(binding)) return NextResponse.json({ error: "ENROLMENT_INACTIVE" }, { status: 403 });
    const verification = await verifyVendor(sample, binding);
    if (verification === "verification_failed") return NextResponse.json({ error: "EVENT_BINDING_FAILED" }, { status: 403 });
    const auxiliary = botd ? { botd: { ...botd, provenance: 'client_claim' as const, version: '2.0.0' as const }, http: studyHttpEvidence(req, binding.session_id), smart_signals: { status: 'not_requested' as const, reason: 'PAID_ENTITLEMENT_NOT_VALIDATED' as const } } : undefined;
    const observation_id = await appendSensor(sample, binding, verification, auxiliary);
    return NextResponse.json({ observation_id, state: sample.state, verification });
  } catch { return NextResponse.json({ state: "error", error: "RESEARCH_UNAVAILABLE" }, { status: 503 }); }
}

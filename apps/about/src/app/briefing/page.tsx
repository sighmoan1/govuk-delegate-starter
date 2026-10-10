import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Delegate briefings" };
export default function BriefingIndex() {
  return <div className="two-thirds">
    <h1>Delegate briefings</h1>
    <p className="lead">A concept demonstration and a detailed discussion of the design.</p>
    <p>Independent synthetic prototype. Prepared 10 October 2026. The Observatory dashboard and classifier contract are ready for review in PRs 110 and 109 and remain unmerged at preparation.</p>
    <h2>Concept briefing</h2>
    <p>Delegation, government precedents, citizen control and the limits of observation. About ten minutes with the demonstration.</p>
    <p><Link href="/briefing/high-level">Read the concept briefing and speaker notes</Link></p>
    <p><a href="/briefings/high-level.pptx" download>Download the editable concept deck</a></p>
    <h2>Design briefing</h2>
    <p>Safeguards, service responsibilities, scaling and open architecture choices. About 25–30 minutes with discussion.</p>
    <p><Link href="/briefing/detailed">Read the design briefing and speaker notes</Link></p>
    <p><a href="/briefings/detailed.pptx" download>Download the editable design deck</a></p>
    <h2>Presenter material</h2>
    <p><Link href="/briefing/demo">Open the demonstration guide</Link></p>
    <p><a href="https://github.com/sighmoan1/govuk-delegate-starter/blob/main/docs/briefings/DEMO_RUNBOOK.md">Full runbook and feature coverage</a></p>
    <p><a href="https://github.com/sighmoan1/govuk-delegate-starter/blob/main/docs/briefings/SOURCES_AND_EVIDENCE.md">Precedents, evidence and the adoption hypothesis</a></p>
  </div>;
}

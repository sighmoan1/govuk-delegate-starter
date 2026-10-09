import type { Metadata } from "next";
import Link from "next/link";
import { urls } from "@/lib/config";

export const metadata: Metadata = { title: "Briefing demonstration guide" };
export default function DemoGuide() {
  return <div className="two-thirds">
    <p><Link href="/briefing">All briefings</Link></p><h1>Demonstration guide</h1>
    <p className="lead">Rehearse on an isolated synthetic stack before the meeting.</p>
    <p>The account pages manage permission. A compatible agent or presenter-operated API client sends service actions. Identify a scripted client as scripted. The guide adds no assistant or transaction console.</p>
    <h2 id="a">A. Sam grants and removes permission</h2>
    <ol><li>Create a fresh request through HMRC’s agent route or the agent API. Open its returned consent URL.</li><li>Sign in as Sam. Select tax-code access and job expenses. Leave employment changes unchecked.</li><li>Check the selection and allow it. Use the same agent to read the tax code and submit the synthetic claim.</li><li>Show the refusal of the ungranted employment action.</li><li>Open the account, inspect the permission and outcome, then remove access.</li><li>Repeat the tax-code request and show the revoked-authority refusal.</li></ol>
    <p><a href={`${urls.hmrc}/act-for-someone`}>HMRC agent request route</a> and <a href={`${urls.delegate}/account/delegates`}>Who can act for you</a>.</p>
    <p>Already accepted work can finish after removal. Revocation prevents later authorised requests.</p>
    <h2 id="b">B. Requests and claims</h2>
    <p>Run the existing swarm demonstration at N=10 before presenting. Compare one person’s repeated claim attempts with separate people’s claims, then show retry or polling load. Read technical demand separately from service outcomes.</p>
    <p><Link href="/swarm">Open the swarm demonstration</Link></p>
    <p>The lower scheduling comparison is a labelled simulation. Limits are illustrative. Check failed invariants before describing a run as successful.</p>
    <h2 id="c">C. Evidence and uncertainty</h2>
    <p>This scene needs the reviewed Observatory stack containing PRs 109–110. Its address and access keys belong to that private setup. Keep the workbench off public tunnels.</p>
    <p>Ingest the minimised source events privately, then load monitoring view. Explore an event and show source evidence, sensor coverage and separate prediction status. Research view has a different key and protected execution labels. Missing evidence stays visible.</p>
    <p>The signature stub reports observed signature evidence. It supplies no trained AI detection accuracy. A service response event does not establish later queue completion.</p>
    <h2 id="d">D. Another service</h2>
    <p>Optional: approve the council capability, read Sam’s case, show refusal of another resident’s case, then revoke council access while retaining HMRC permission. Council owns its records and checks their ownership.</p>
    <p><a href="https://github.com/sighmoan1/govuk-delegate-starter/blob/main/docs/SECOND_SERVICE.md">Council request and verification instructions</a></p>
    <h2>Fallback and full coverage</h2>
    <p>If a live dependency fails, use the decks and pinned recorded evidence and explain the limitation. Treat screenshot state as historical. Never replace a live result with an expected number.</p>
    <p><a href="https://github.com/sighmoan1/govuk-delegate-starter/blob/codex/issue-111-public-digital-briefings/docs/briefings/DEMO_RUNBOOK.md">Full runbook, preparation and feature coverage</a></p>
  </div>;
}

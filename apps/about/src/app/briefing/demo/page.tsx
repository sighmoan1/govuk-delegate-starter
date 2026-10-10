import type { Metadata } from "next";
import Link from "next/link";
import { urls } from "@/lib/config";
import { publicBriefingMode } from "@/lib/public-briefing";

export const metadata: Metadata = { title: "Briefing demonstration guide" };
export default function DemoGuide() {
  return <div className="two-thirds">
    <p><Link href="/briefing">All briefings</Link></p><h1>Demonstration guide</h1>
    <p className="lead">Start with the three-minute permission journey, then choose the optional scenes for your audience.</p>
    <h2>Available public URLs</h2>
    <ul>
      <li><a href="https://about-demo.bathos.org/briefing">Briefings</a>: the idea, design and editable decks.</li>
      <li><a href="https://delegate-demo.bathos.org/account/delegates">Delegate account</a>: permissions, original approval, activity and removal.</li>
      <li><a href="https://hmrc-demo.bathos.org">Mock HMRC</a> and <a href="https://hmrc-demo.bathos.org/act-for-someone">HMRC agent entry</a>: synthetic tax service and request route.</li>
      <li><a href="https://login-demo.bathos.org">One Login simulator</a>: mock sign-in, normally reached from HMRC or Delegate.</li>
      <li><a href="https://whenisbins-demo.bathos.org">WhenIsBins connector</a> and <a href="https://whenisbins-demo.bathos.org/evidence">its evidence</a>: a separate external-service integration.</li>
    </ul>
    <p>Public addresses depend on the presenter computer, Docker and tunnel staying running. The identity and HMRC journeys use synthetic data. WhenIsBins can contact an external provider; real cancellation remains disabled and unverified. Removing Delegate permission does not unsubscribe an existing reminder.</p>
    <h2>Private presenter and research tools</h2>
    <p>The presenter dashboard at localhost:3304 provides scenario controls and agent prompts. Reset controls change shared synthetic state: rehearse on an isolated stack and coordinate before resetting. Sam’s phone tooling stays private.</p>
    <p>Observatory is a protected research workbench. Its standard local port is 3303; review instances on 5303 and 5703 are temporary setups, not public visitor destinations. They require their configured keys and feeds. Ask the operator which instance is running and keep keys off screen.</p>
    <p><a href="https://github.com/sighmoan1/govuk-delegate-starter/blob/main/docs/DEMO_GUIDE.md">Current guide, private routes and stakeholder claims</a></p>
    <p>The account pages manage permission. The supplied presenter client or a compatible agent sends service actions. Identify a scripted client as scripted. The full runbook includes the client commands.</p>
    <h2 id="a">A. Sam grants and removes permission, about three minutes</h2>
    <ol><li>Create a fresh request through HMRC’s agent route or the agent API. Open its returned consent URL.</li><li>Sign in as Sam. Select tax-code access and job expenses. Leave employment changes unchecked.</li><li>Check the selection and allow it. Use the same agent to read the tax code and submit the synthetic claim.</li><li>Show the refusal of the ungranted employment action.</li><li>Open the account, inspect the permission and outcome, then remove access.</li><li>Repeat the tax-code request and show the revoked-authority refusal.</li></ol>
    <p><a href={`${urls.hmrc}/act-for-someone`}>HMRC agent request route</a> and <a href={`${urls.delegate}/account/delegates`}>Who can act for you</a>.</p>
    <p>Already accepted work can finish after removal. Revocation prevents later authorised requests.</p>
    <h2 id="b">B. Requests and claims</h2>
    <p>Run the existing swarm demonstration at N=10 before presenting. Compare one person’s repeated claim attempts with separate people’s claims, then show retry or polling load. Read technical demand separately from service outcomes.</p>
    <p>{publicBriefingMode() ? <>The presenter prepares and runs the swarm demonstration privately, then shows its recorded results.</> : <Link href="/swarm">Open the swarm demonstration</Link>}</p>
    <p>The lower scheduling comparison is a labelled simulation. Limits are illustrative. Check failed invariants before describing a run as successful.</p>
    <h2 id="c">C. Evidence and uncertainty</h2>
    <p>The Observatory dashboard and classifier contract (PRs 110 and 109) are merged. This scene needs a configured isolated Observatory instance. Its address and access keys belong to that private setup. Keep the workbench off public tunnels.</p>
    <p>Ingest the minimised source events privately, then load monitoring view. Explore an event and show source evidence, sensor coverage and separate prediction status. Research view has a different key and protected execution labels. Missing evidence stays visible.</p>
    <p>The signature stub reports observed signature evidence. It supplies no trained AI detection accuracy. A service response event does not establish later queue completion.</p>
    <h2 id="d">D. Another service</h2>
    <p>Optional: approve the council capability, read Sam’s case, show refusal of another resident’s case, then revoke council access while retaining HMRC permission. Council owns its records and checks their ownership.</p>
    <p><a href="https://github.com/sighmoan1/govuk-delegate-starter/blob/main/docs/SECOND_SERVICE.md">Council request and verification instructions</a></p>
    <h2>Fallback and full coverage</h2>
    <p>If a live dependency fails, use the decks and pinned recorded evidence and explain the limitation. Treat screenshot state as historical. Never replace a live result with an expected number.</p>
    <p><a href="https://github.com/sighmoan1/govuk-delegate-starter/blob/main/docs/briefings/DEMO_RUNBOOK.md">Full runbook, preparation and feature coverage</a></p>
  </div>;
}

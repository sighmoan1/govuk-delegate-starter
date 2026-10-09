import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Project status" };

export default function ProjectStatus() {
  return (
    <div className="two-thirds">
      <h1>Project status</h1>
      <p className="lead">The core delegation journey is implemented. The next work makes service integration more generic and tests the value of the approach.</p>
      <p>Delivery snapshot: 9 October 2026. This is an independent prototype using synthetic data.</p>
      <h2>Implemented</h2>
      <ul>
        <li>A person signs in through the One Login simulator, approves selected permissions and can remove access.</li>
        <li>An agent authenticates separately. HMRC checks current authority with Delegate before acting; expired, revoked or missing permission is refused.</li>
        <li>People can see service outcomes and answers sent in their name, dispute an answer and stop one permission.</li>
        <li>HMRC handles retries without repeating business effects, receives asynchronous claims durably and processes them through a queue.</li>
        <li>Authority checks spend no citizen allowance. HMRC separates illustrative business rules from traffic throttles and supports conditional progress polling.</li>
        <li>Registered services can publish validated, immutable catalogue versions. Safe public discovery is available; publication creates no authority.</li>
      </ul>
      <p>HMRC owns its versioned capability catalogue and registers it during setup. Catalogue changes preserve historical grants and pending consent; demo reset retains catalogue history.</p>
      <h2>Still to build or investigate</h2>
      <p>Generic catalogue-driven consent, immutable consent snapshots, richer enforceable mandate constraints and a second independent mock department remain separate engineering work. Grouped cross-service consent and recognition of externally issued authority are proposals.</p>
      <p>Orchestrate is hypothetical. This prototype provides no agent planner, scheduler, push subscription or webhook. National questions about lawful authority, assurance, privacy, liability, inclusion and service policy are deferred with owner roles and reopening triggers.</p>
      <h2>What the evidence can support</h2>
      <p>Automated tests and synthetic demonstrations check bounded software behaviour. They do not establish national-scale capacity, fraud reduction, citizen comprehension or economic benefit. No comparative or real-world economic result is published in the evidence register.</p>
      <p><Link href="/evidence">Read the evidence and experimental plan</Link>, <Link href="/how-it-works">see how it works</Link>, or <Link href="/delegate-orchestrate">explore the architecture boundary</Link>.</p>
    </div>
  );
}

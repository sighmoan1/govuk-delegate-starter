import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Project status" };

export default function ProjectStatus() {
  return (
    <div className="two-thirds">
      <h1>Project status</h1>
      <p className="lead">Catalogue-driven consent and service-scoped authority work across two independent synthetic services. Research tools test the approach's value separately.</p>
      <p>Delivery snapshot: 9 October 2026. This is an independent prototype using synthetic data.</p>
      <h2>Implemented</h2>
      <ul>
        <li>A person signs in through the One Login simulator, approves selected permissions and can remove access.</li>
        <li>An agent authenticates separately. HMRC checks current authority with Delegate before acting; expired, revoked or missing permission is refused.</li>
        <li>People can see service outcomes and answers sent in their name, dispute an answer and stop one permission.</li>
        <li>HMRC handles retries without repeating business effects, receives asynchronous claims durably and processes them through a queue.</li>
        <li>Authority checks spend no citizen allowance. HMRC separates illustrative business rules from traffic throttles and supports conditional progress polling.</li>
        <li>Registered services can publish validated, immutable catalogue versions. Safe public discovery is available; publication creates no authority.</li>
        <li>Consent starts with no permissions selected. Original approval evidence is immutable; later narrowing and removal retain their own history.</li>
        <li>Services define supported restrictions. Delegate checks their structure and narrowing; HMRC enforces its synthetic tax-year rule before acting.</li>
        <li>An independent council service owns its catalogue, credential and records. HMRC permission grants no council access.</li>
      </ul>
      <p>HMRC owns its versioned capability catalogue and registers it during setup. Catalogue changes preserve historical grants and pending consent; demo reset retains catalogue history.</p>
      <h2>Still to build or investigate</h2>
      <p>Grouped cross-service consent and recognition of externally issued authority are proposals. Production identity mapping, additional service-owned restrictions and an actual participant study remain open.</p>
      <p>Orchestrate is hypothetical. This prototype provides no agent planner, scheduler, push subscription or webhook. National questions about lawful authority, assurance, privacy, liability, inclusion and service policy are deferred with owner roles and reopening triggers.</p>
      <h2>What the evidence can support</h2>
      <p>A reproducible comparison of permissions managed by HMRC and by Delegate completed the same legitimate workload with no tested duplicate or unauthorised business effects. It found no incremental outcome advantage for Delegate in that workload. Human effort, support costs and economic benefit were not measured.</p>
      <p>The separate Observatory collects explicitly enabled research observations and protects execution labels from sensors. Its audited archive contains scripted runs and zero human participant runs. The optional Fingerprint adapter still needs a real vendor run; device signals are not proof of human or AI execution. These tools do not establish national-scale capacity, fraud reduction or citizen comprehension.</p>
      <p><Link href="/evidence">Read the evidence and experimental plan</Link>, <Link href="/how-it-works">see how it works</Link>, or <Link href="/delegate-orchestrate">explore the architecture boundary</Link>.</p>
    </div>
  );
}

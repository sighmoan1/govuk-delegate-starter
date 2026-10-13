import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Agentic flooding and Delegate" };

export default function AgenticFlooding() {
  return (
    <div>
      <h1>Agentic flooding: make authorised agents identifiable</h1>
      <p className="lead">Delegate does not stop a flood of automated requests. It offers legitimate agents a way to prove who they represent and what they are allowed to do.</p>
      <p>Without verifiable authority, a service sees a mixture of legitimate assistants and hostile automation. Behavioural detection can help, but it cannot establish whether a person gave permission.</p>
      <h2>Today: a mixed stream</h2>
      <div className="table-container"><table><thead><tr><th scope="col">Sources</th><th scope="col">At the service boundary</th><th scope="col">Consequence</th></tr></thead><tbody><tr><td>Legitimate assistants and malicious swarms</td><td>Requests arrive without a reusable proof of delegated authority</td><td>Risk must be inferred; legitimate users face friction and abuse may pass</td></tr></tbody></table></div>
      <h2>With Delegate: a verifiable route</h2>
      <ol>
        <li>The person asks their assistant to claim tax relief.</li>
        <li>The assistant discovers HMRC's supported integration and checks whether it has authority.</li>
        <li>If not, it requests a limited mandate. The person signs in through One Login and approves or refuses.</li>
        <li>Delegate records the mandate, including representative, scope and expiry.</li>
        <li>The assistant calls HMRC; HMRC checks the mandate and its own business rules before accepting work.</li>
        <li>HMRC returns the outcome. The person can inspect and revoke authority for future requests.</li>
      </ol>
      <p><strong>Important:</strong> the agent must choose the supported route itself. Prompting it to use Delegate would not establish that agents naturally prefer it. This remains a testable hypothesis.</p>
      <h2>What changes for the service?</h2>
      <div className="table-container"><table><thead><tr><th scope="col">Verifiable authority</th><th scope="col">No verifiable authority</th></tr></thead><tbody><tr><td>Known representative, principal, capability and expiry. Service still checks fraud, eligibility, capacity and transaction rules.</td><td>Conventional abuse controls, proportionate throttling and alternative routes for people who cannot authorise digitally. Unknown does not mean malicious.</td></tr></tbody></table></div>
      <h2>What this does not solve</h2>
      <p>Authorised actors can still be malicious, compromised or mistaken. Unidentified agents can still be legitimate. Delegate does not replace anti-fraud controls, idempotency, fair queueing or infrastructure protection. More genuine claims are not inherently an attack.</p>
      <h2>How to test the claim</h2>
      <p>Compare a good agent API with service-local delegation against the same API plus Delegate. Measure unprompted route choice, completion, friction, verified outcomes, technical load and cost. A demonstration of the flow is not evidence that flooding has been reduced.</p>
      <p><Link href="/which-route">See which route agents choose</Link> · <Link href="/swarm">Explore the swarm scenario</Link> · <Link href="/evidence">Review evidence and limitations</Link> · <Link href="/why">Why we are exploring Delegate</Link></p>
    </div>
  );
}

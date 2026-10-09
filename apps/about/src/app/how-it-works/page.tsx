import Link from "next/link";
import type { Metadata } from "next";
import { hmrcMiddlewareSource, urls } from "@/lib/config";

export const metadata: Metadata = { title: "How it works" };

export default function HowItWorks() {
  const source = hmrcMiddlewareSource();
  return (
    <div>
      <div className="two-thirds">
        <h1>How it works</h1>
        <p className="lead">One Login says who Sam is. Delegate records who may act for her. HMRC asks Delegate before letting an agent act.</p>
      </div>

      <pre className="diagram" aria-label="Diagram of the four systems">{`
                 ┌──────────────────────────────┐
                 │ GOV.UK One Login             │  signs Sam in
                 └────────┬───────────┬─────────┘
                    OIDC  │           │  OIDC
                          ▼           ▼
┌──────────────────────────────┐   ┌──────────────────────────────┐
│ GOV.UK Delegate              │   │ HMRC                         │
│ consent screen               │◄──│ pages for people             │
│ who can act for you          │   │ API for agents               │
│ check API                    │   │ asks Delegate per request    │
└──────────────┬───────────────┘   └──────────────▲───────────────┘
   consent     │ redirect                          │ agent token + who it acts for
               ▼                                   │
┌──────────────────────────────────────────────────┴───────────────┐
│ The agent: signs in to Delegate as itself, never as Sam          │
└──────────────────────────────────────────────────────────────────┘`}</pre>

      <div className="two-thirds">
        <h2>Who manages tasks, and who manages authority?</h2>
        <p>
          An agent or AI provider manages the citizen’s task. Delegate checks a registered mandate; it does not
          interpret goals or orchestrate work. Each receiving department defines its own actions and rules.
          <Link href="/delegate-orchestrate"> See the Delegate / Orchestrate architecture</Link> and the
          distinction between the current prototype and the proposed cross-government design.
        </p>

        <h2>The relationship, not a token</h2>
        <p>
          The agent does not carry a signed permission around. Each time it calls HMRC, HMRC asks GOV.UK Delegate whether this agent may do
          this thing for this person right now. That is how HMRC’s own agent authorisation works. It also means that when Sam removes access,
          the very next request is refused.
        </p>

        <h2>The core authority-check call</h2>
        <pre className="source">{`POST ${urls.delegate}/api/authorisations/check
x-service-key: <HMRC's own key>

{ "agent_token": "...", "principal_id": "...",
  "service": "hmrc-personal-tax", "capability": "claim_job_expenses" }

→ { "authorised": true, "subject": "<Sam's One Login id>", "delegate": { "name": "<the agent>" } }
→ { "authorised": false, "reason": "PERMISSION_MISSING" }   // or AUTHORISATION_REVOKED, NO_AUTHORISATION, …`}</pre>
        <p>
          Delegate verifies registered-agent credentials for the check; HMRC also verifies browser-agent signatures and binds agent sessions. If the answer is yes, Delegate tells
          HMRC who the person is: the same One Login identifier HMRC saw when Sam signed in herself.
        </p>

        <h2>Service-owned permissions</h2>
        <p>
          Registered services can publish immutable, versioned lists of permissions with authenticated credentials.
          Delegate validates the list and makes safe metadata discoverable. Publication grants nobody access.
          HMRC owns its capability catalogue and registers it during setup; historical grants keep their original definitions.
          <Link href="/project-status"> See the current delivery status</Link>.
        </p>

        <h2>Two things an agent can do that need more care</h2>
        <p>
          <strong>Answering HMRC.</strong> When HMRC asks about a claim, an agent can suggest an answer, but HMRC doesn’t block the agent, because it can’t
          see the chat. It records what was sent and whether the agent said the person agreed, and GOV.UK shows the person both. They can say
          they didn’t agree. Delegate removes that permission and records the dispute; HMRC reopens the question when it next checks the receipt. This is pull-based, not an immediate notification.
        </p>
        <p>
          <strong>Checking in later.</strong> An agent can check a claim on a schedule while the person isn’t there. The permission ends on
          a date. Scheduling belongs to the external agent or platform: the prototype supplies polling endpoints, without a scheduler or push notifications. HMRC allows a few checks a day for the person, however many agents ask. Removing access stops the next check.
        </p>

        <h2>Three lanes at the service</h2>
        <dl className="summary-list">
          <div><dt>Signed-in person</dt><dd>The normal service.</dd><dd /></div>
          <div><dt>Authorised agent</dt><dd>The same service through an API, with clear machine-readable refusals, a high rate limit and a full audit trail: which agent, for whom, under which permission.</dd><dd /></div>
          <div><dt>Not identified</dt><dd>Slower, tightly limited, plain-text refusals that point to GOV.UK Delegate, and a challenge page on the website.</dd><dd /></div>
        </dl>
        <p>“Not identified” is not “malicious”. It includes people who haven’t signed in, assistive technology and agents that haven’t integrated yet. The friction is an incentive to identify yourself, not a verdict.</p>

        <h2>Limits belong to the person</h2>
        <p>
          Three things are kept apart. <strong>Identity</strong> is who is asking, and it can be faked or hidden. <strong>Authority</strong> is
          what the person allowed, checked with GOV.UK Delegate on every request. <strong>Business limits</strong> are how much everyone using that
          person’s authority may do together, applied by HMRC when it does the work (asking Delegate whether an agent may act uses none of them): one claim per tax year unless there’s new evidence, a cap on open
          claims, and one change to the refund bank account a month.
        </p>
        <p>
          Business limits are counted against the person’s One Login identifier. Technical throughput limits are separate and may follow the operator, person or whole service; tax-code lookups and progress polls are technical load. A person with a hundred agents,
          or a hundred hidden sessions, cannot multiply the same claim. Traffic timings and throttles may differ between routes. An agent’s identity decides what it may do: sensitive changes
          need an agent whose identity is verified or registered, plus the person’s fresh approval. It never raises the limits.
        </p>
        <p>
          That is about one person’s claim, not about how many claims there are. A hundred claims from a hundred different people is not a swarm
          beating a limit: it may be a hundred people’s legitimate demand, sent through one agent provider. In the bounded experiment, cooperating clients follow retry guidance and HMRC receives their claims and records them
          gradually. This is not a guarantee under arbitrary load or outage. What it slows, with a 429 that says when to come back, is traffic that costs it something, such as repeated polling. The
          swarm page measures the two apart, and says which numbers are measured and which are simulated.
        </p>
        <p>
          Agents can pass part of their authority to sub-agents. Each one stays inside what its parent was given, down to a maximum depth,
          and everything traces back to the person. <Link href="/swarm">Scenario 4</Link> runs it.
        </p>

        <h2>What HMRC added</h2>
        <p>
          HMRC integrates authority checks, agent-request creation and polling, agent sessions, browser permission guards, discovery documents, traffic controls, receipts, dispute reconciliation and outcome reporting. Its pages and handlers also support these journeys. The wrapper below shows the core check interface within that larger integration. Eight capabilities are seeded; the browser request page offers seven, omitting address changes, which the API supports.
        </p>
      </div>
      <details>
        <summary>HMRC’s middleware: <code>delegated-authority.ts</code> ({source.split("\n").length} lines)</summary>
        <pre className="source">{source}</pre>
      </details>

      <div className="two-thirds">
        <p>“New evidence” is a prototype check of hashes of trimmed, lowercased strings. It does not establish relevance or materiality. The business and technical limits are illustrative demo policy.</p>
        <p>Sensitive changes bind approval to the proposal, normalised payload, person, service, capability, key and expiry. The default window is 10 minutes from proposal creation; checks do not consume approval. Bank and address details are synthetic and only shape-validated.</p>
        <h2>What this prototype simplifies</h2>
        <ul>
          <li><strong>A stand-in for One Login.</strong> The sign-in screens are a lookalike. Behind them, the official GOV.UK One Login simulator does the real OpenID Connect work: codes, signed tokens, keys and userinfo. On public URLs it’s strict, with a real password and a code “sent to Sam’s phone”. Locally, any nonempty password is accepted.</li>
          <li><strong>One sign-in client.</strong> The One Login simulator supports one client, so GOV.UK Delegate and HMRC share it. In production they would be separate.</li>
          <li><strong>The same person ID in both places.</strong> Separate relying parties may receive different identifiers for the same person. The shared identifier here is a synthetic shortcut; trusted service-scoped mapping and production integration policy remain unresolved (#35).</li>
          <li><strong>Friction stand-ins.</strong> The rate limit, delay and checkbox challenge only show the incentive. A real service would choose its own proportionate controls.</li>
          <li><strong>Synthetic data.</strong> Nothing connects to real One Login, HMRC or anyone’s records.</li>
        </ul>
      </div>
    </div>
  );
}

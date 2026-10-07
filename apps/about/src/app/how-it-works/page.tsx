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
│ Example AI: signs in to Delegate as itself, never as Sam         │
└──────────────────────────────────────────────────────────────────┘`}</pre>

      <div className="two-thirds">
        <h2>The relationship, not a token</h2>
        <p>
          The agent does not carry a signed permission around. Each time it calls HMRC, HMRC asks GOV.UK Delegate whether this agent may do
          this thing for this person right now. That is how HMRC’s own agent authorisation works. It also means that when Sam removes access,
          the very next request is refused.
        </p>

        <h2>The one call a service makes</h2>
        <pre className="source">{`POST ${urls.delegate}/api/authorisations/check
x-service-key: <HMRC's own key>

{ "agent_token": "...", "principal_id": "...",
  "service": "hmrc-personal-tax", "capability": "claim_job_expenses" }

→ { "authorised": true, "subject": "<Sam's One Login id>", "delegate": { "name": "Example AI" } }
→ { "authorised": false, "reason": "PERMISSION_MISSING" }   // or AUTHORISATION_REVOKED, NO_AUTHORISATION, …`}</pre>
        <p>
          Delegate checks the agent’s identity itself, so HMRC never has to manage agent credentials. If the answer is yes, Delegate tells
          HMRC who the person is: the same One Login identifier HMRC saw when Sam signed in herself.
        </p>

        <h2>Three lanes at the service</h2>
        <dl className="summary-list">
          <div><dt>Signed-in person</dt><dd>The normal service.</dd><dd /></div>
          <div><dt>Authorised agent</dt><dd>The same service through an API, with clear machine-readable refusals, a high rate limit and a full audit trail: which agent, for whom, under which permission.</dd><dd /></div>
          <div><dt>Not identified</dt><dd>Slower, tightly limited, plain-text refusals that point to GOV.UK Delegate, and a challenge page on the website.</dd><dd /></div>
        </dl>
        <p>“Not identified” is not “malicious”. It includes people who haven’t signed in, assistive technology and agents that haven’t integrated yet. The friction is an incentive to identify yourself, not a verdict.</p>

        <h2>What HMRC added</h2>
        <p>
          A registration with GOV.UK Delegate, done once: a name, the five actions it offers, and a key. Then one file, which wraps every API
          route. Its sign-in, its pages and its business logic did not change.
        </p>
      </div>
      <details>
        <summary>HMRC’s middleware: <code>delegated-authority.ts</code> ({source.split("\n").length} lines)</summary>
        <pre className="source">{source}</pre>
      </details>

      <div className="two-thirds">
        <h2>What this prototype simplifies</h2>
        <ul>
          <li><strong>A stand-in for One Login.</strong> The sign-in screens are a lookalike. Behind them, the official GOV.UK One Login simulator does the real OpenID Connect work: codes, signed tokens, keys and userinfo. Any password is accepted.</li>
          <li><strong>One sign-in client.</strong> The One Login simulator supports one client, so GOV.UK Delegate and HMRC share it. In production they would be separate.</li>
          <li><strong>The same person ID in both places.</strong> Real One Login gives each service a different identifier for the same person. Production would need GOV.UK Delegate and services to share one, or Delegate to hold a mapping.</li>
          <li><strong>Friction stand-ins.</strong> The rate limit, delay and checkbox challenge only show the incentive. A real service would choose its own proportionate controls.</li>
          <li><strong>A scripted assistant.</strong> Example AI follows a script. Whatever it tries, HMRC still asks GOV.UK Delegate.</li>
          <li><strong>Synthetic data.</strong> Nothing connects to real One Login, HMRC or anyone’s records.</li>
        </ul>
      </div>
    </div>
  );
}

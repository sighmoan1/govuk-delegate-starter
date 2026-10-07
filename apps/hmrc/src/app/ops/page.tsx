import type { Metadata } from "next";
import Link from "next/link";
import { readFileSync } from "node:fs";
import path from "node:path";
import { opsSummary, LANES } from "@/lib/events";
import { config, LANE_LIMITS, UNTRUSTED_DELAY_MS } from "@/lib/config";
import { fmtTime } from "@/lib/format";

export const metadata: Metadata = { title: "Operations view" };
export const dynamic = "force-dynamic";

const LANE_LABEL = { AUTHENTICATED_HUMAN: "Signed-in person", AUTHORISED_AGENT: "Authorised agent", UNTRUSTED: "Not identified" } as const;
const CAP = { view_tax_code: "View tax code", claim_job_expenses: "Claim WFH relief", update_employment: "Update employment", change_refund_account: "Change refund account", change_address: "Change address" } as Record<string, string>;
const pct = (n: number) => (Number.isFinite(n) ? `${Math.round(n * 100)}%` : "—");

function LaneTable({ rows, caption }: { rows: Awaited<ReturnType<typeof opsSummary>>["lastMinute"]; caption: string }) {
  return (
    <div className="table-container">
      <table className="lanes">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr><th scope="col">Lane</th><th scope="col">Requests</th><th scope="col">Allowed</th><th scope="col">Refused</th><th scope="col">Throttled</th><th scope="col">Challenged</th><th scope="col">Median time to answer</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.lane}>
              <th scope="row">{LANE_LABEL[r.lane]}</th><td>{r.requests}</td><td>{r.allowed}</td><td>{r.refused}</td><td>{r.throttled}</td><td>{r.challenged}</td><td>{r.requests > r.throttled ? `${r.medianMs} ms` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function Ops({ searchParams }: { searchParams: Promise<{ live?: string }> }) {
  const { live } = await searchParams;
  const s = await opsSummary();
  let source = "";
  try { source = readFileSync(path.join(process.cwd(), "src/lib/delegated-authority.ts"), "utf8"); } catch { source = "(source not available in this build)"; }

  return (
    <div>
      {live && <meta httpEquiv="refresh" content="3" />}
      <span className="caption">HMRC service team</span>
      <h1>Operations view</h1>
      <p className="lead">Every request to this service, by lane: a signed-in person, an agent with permission from GOV.UK Delegate, or traffic we cannot identify.</p>
      <p className="live-note">
        {live ? <>Refreshing every 3 seconds. <Link href="/ops">Stop</Link>.</> : <><Link href="/ops?live=1">Refresh every 3 seconds</Link> while running the flood test from <a href={`${config.agentUrl}/flood`}>Example AI</a>.</>}
      </p>

      <h2>Last 60 seconds</h2>
      <LaneTable rows={s.lastMinute} caption="Requests in the last minute by lane" />
      <h2>Last 24 hours</h2>
      <LaneTable rows={s.lastDay} caption="Requests in the last day by lane" />

      <h2>How each lane is treated</h2>
      <div className="table-container">
        <table className="lane-key">
          <thead><tr><th scope="col">Lane</th><th scope="col">Who</th><th scope="col">What they get</th></tr></thead>
          <tbody>
            <tr>
              <th scope="row">Signed-in person</th>
              <td>A valid GOV.UK One Login session with this service.</td>
              <td>The service as normal. Limit {LANE_LIMITS.AUTHENTICATED_HUMAN} a minute. No delay, no challenge.</td>
            </tr>
            <tr>
              <th scope="row">Authorised agent</th>
              <td>A registered agent acting for a person who gave it this permission. Checked with GOV.UK Delegate on every request.</td>
              <td>A structured API with machine-readable refusals. Limit {LANE_LIMITS.AUTHORISED_AGENT} a minute. No delay, no challenge. A full audit trail: which agent, for whom, under which permission.</td>
            </tr>
            <tr>
              <th scope="row">Not identified</th>
              <td>Everyone else: not signed in, no agent credential, or a credential Delegate does not recognise.</td>
              <td>No data and no structured errors: a plain-text refusal pointing to GOV.UK Delegate. Limit {LANE_LIMITS.UNTRUSTED} a minute, a {UNTRUSTED_DELAY_MS / 1000} second delay, and a challenge page on the website.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>“Not identified” is not “malicious”. It includes people who have not signed in, assistive technology, and agents that have not integrated yet. The treatment is an incentive to identify yourself, not a verdict, and it is where a real service would put its own proportionate controls.</p>

      <h2>Agents seen</h2>
      <div className="table-container">
        <table>
          <thead><tr><th scope="col">Agent</th><th scope="col">Requests</th><th scope="col">People</th><th scope="col">Refusal rate</th></tr></thead>
          <tbody>
            {s.perAgent.length === 0 && <tr><td colSpan={4}>None yet.</td></tr>}
            {s.perAgent.map((a) => <tr key={a.name}><th scope="row">{a.name}</th><td>{a.requests}</td><td>{a.people}</td><td>{pct(a.refusalRate)}</td></tr>)}
          </tbody>
        </table>
      </div>

      <h2>What HMRC added</h2>
      <p>
        Registration with GOV.UK Delegate, once: a name, the five actions this service offers, and a key. Then this file. Every API route is
        wrapped in it. The sign-in, the pages and the business logic did not change. The heart of it is one call:
      </p>
      <pre className="source source--short"><code>{`const check = await askDelegate({ agent_token, principal_id, capability });
if (!check.authorised) refuse(check.reason);     // PERMISSION_MISSING, AUTHORISATION_REVOKED, …
const taxpayer = await findOrCreateTaxpayer(check.subject);   // same One Login subject
run the business handler, recording the agent as acting for the taxpayer`}</code></pre>
      <details>
        <summary>Show the whole file ({source.split("\n").length} lines)</summary>
        <pre className="source"><code>{source}</code></pre>
      </details>

      <h2>Recent requests</h2>
      <div className="table-container">
        <table className="ops-recent">
          <thead><tr><th scope="col">Time</th><th scope="col">Lane</th><th scope="col">Who</th><th scope="col">Action</th><th scope="col">Outcome</th><th scope="col">Reason</th><th scope="col">Time taken</th></tr></thead>
          <tbody>
            {s.recent.map((e) => (
              <tr key={e.id}>
                <td>{fmtTime(e.timestamp)}</td>
                <td>{LANE_LABEL[e.lane]}</td>
                <td>{e.agentName ?? (e.lane === "AUTHENTICATED_HUMAN" ? "The person" : "—")}</td>
                <td>{e.capability ? CAP[e.capability] ?? e.capability : e.path}</td>
                <td><span className={`outcome outcome--${e.outcome.toLowerCase()}`}>{e.outcome.charAt(0) + e.outcome.slice(1).toLowerCase()}</span></td>
                <td className="mono">{e.reason ?? "—"}</td>
                <td>{e.latencyMs} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small">Lanes are {LANES.length} and fixed. Delegate’s own view of declared agent activity across services is at <a href={`${config.delegateUrl}/activity`}>{config.delegateUrl}/activity</a>.</p>
    </div>
  );
}

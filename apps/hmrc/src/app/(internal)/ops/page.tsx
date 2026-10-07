import type { Metadata } from "next";
import Link from "next/link";
import { opsSummary } from "@/lib/events";
import { LANE_LIMITS, UNTRUSTED_DELAY_MS } from "@/lib/config";
import { fmtTime } from "@/lib/format";

export const metadata: Metadata = { title: "Operations" };
export const dynamic = "force-dynamic";

const LANE_LABEL = { AUTHENTICATED_HUMAN: "Signed-in person", AUTHORISED_AGENT: "Authorised agent", DECLARED_AGENT: "Agent without permission", UNTRUSTED: "Not identified" } as const;
const CAP: Record<string, string> = {
  view_tax_code: "View tax code",
  claim_job_expenses: "Claim WFH relief",
  update_employment: "Update employment",
  change_refund_account: "Change refund account",
  change_address: "Change address",
};
const pct = (n: number) => (Number.isFinite(n) ? `${Math.round(n * 100)}%` : "—");

type Rows = Awaited<ReturnType<typeof opsSummary>>["lastMinute"];

function LaneTable({ rows, caption }: { rows: Rows; caption: string }) {
  return (
    <div className="table-container">
      <table className="lanes">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Lane</th><th scope="col">Requests</th><th scope="col">Allowed</th><th scope="col">Refused</th>
            <th scope="col">Throttled</th><th scope="col">Challenged</th><th scope="col">Median time to answer</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.lane}>
              <th scope="row">{LANE_LABEL[r.lane]}</th><td>{r.requests}</td><td>{r.allowed}</td><td>{r.refused}</td>
              <td>{r.throttled}</td><td>{r.challenged}</td><td>{r.requests > r.throttled ? `${r.medianMs} ms` : "—"}</td>
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
  return (
    <div>
      {live && <meta httpEquiv="refresh" content="3" />}
      <h1>Traffic by lane</h1>
      <p className="ops-toolbar">
        <span>API and web requests to this service.</span>
        {live ? <Link href="/ops">Auto-refresh on (3s) · turn off</Link> : <Link href="/ops?live=1">Turn on auto-refresh</Link>}
      </p>

      <h2>Last 60 seconds</h2>
      <LaneTable rows={s.lastMinute} caption="Requests in the last minute by lane" />
      <h2>Last 24 hours</h2>
      <LaneTable rows={s.lastDay} caption="Requests in the last day by lane" />

      <h2>Lane policy</h2>
      <div className="table-container">
        <table className="lane-key">
          <thead><tr><th scope="col">Lane</th><th scope="col">Identified by</th><th scope="col">Limit</th><th scope="col">Response</th></tr></thead>
          <tbody>
            <tr><th scope="row">Signed-in person</th><td>GOV.UK One Login session</td><td>{LANE_LIMITS.AUTHENTICATED_HUMAN}/min</td><td>Full service</td></tr>
            <tr><th scope="row">Authorised agent</th><td>Agent token, checked with GOV.UK Delegate per request</td><td>{LANE_LIMITS.AUTHORISED_AGENT}/min</td><td>Full API, JSON errors</td></tr>
            <tr><th scope="row">Not identified</th><td>None</td><td>{LANE_LIMITS.UNTRUSTED}/min</td><td>{UNTRUSTED_DELAY_MS / 1000}s delay, plain-text refusal, web challenge</td></tr>
          </tbody>
        </table>
      </div>

      <h2>Agents</h2>
      <div className="table-container">
        <table>
          <thead><tr><th scope="col">Agent</th><th scope="col">Requests</th><th scope="col">People</th><th scope="col">Refusal rate</th></tr></thead>
          <tbody>
            {s.perAgent.length === 0 && <tr><td colSpan={4}>None in the last 24 hours.</td></tr>}
            {s.perAgent.map((a) => <tr key={a.name}><th scope="row">{a.name}</th><td>{a.requests}</td><td>{a.people}</td><td>{pct(a.refusalRate)}</td></tr>)}
          </tbody>
        </table>
      </div>

      <h2>Recent requests</h2>
      <div className="table-container">
        <table className="ops-recent">
          <thead>
            <tr><th scope="col">Time</th><th scope="col">Lane</th><th scope="col">Caller</th><th scope="col">Action</th><th scope="col">Outcome</th><th scope="col">Reason</th><th scope="col">Time taken</th></tr>
          </thead>
          <tbody>
            {s.recent.map((e) => (
              <tr key={e.id}>
                <td>{fmtTime(e.timestamp)}</td>
                <td>{LANE_LABEL[e.lane]}</td>
                <td>{e.agentName ?? (e.lane === "AUTHENTICATED_HUMAN" ? "Taxpayer" : "—")}</td>
                <td>{e.capability ? CAP[e.capability] ?? e.capability : e.path}</td>
                <td><span className={`outcome outcome--${e.outcome.toLowerCase()}`}>{e.outcome.charAt(0) + e.outcome.slice(1).toLowerCase()}</span></td>
                <td className="mono">{e.reason ?? "—"}</td>
                <td>{e.latencyMs} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

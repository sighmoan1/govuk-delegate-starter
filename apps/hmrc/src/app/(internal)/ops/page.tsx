import type { Metadata } from "next";
import { opsSummary, capacityByPerson } from "@/lib/events";
import { LANE_LIMITS, UNTRUSTED_DELAY_MS } from "@/lib/config";
import { PRINCIPAL_WINDOWS, currentLimits, type CostClass } from "@/lib/throughput";
import { fmtTime } from "@/lib/format";
import { prisma } from "@/lib/db";

const COST_CLASSES: CostClass[] = ["read", "status_poll", "write", "expensive_query"];
const COST_LABEL: Record<CostClass, string> = { read: "Read", status_poll: "Status poll", write: "Write", expensive_query: "Expensive query" };

type Metrics = ReturnType<typeof import("@/lib/events").requestMetrics>;
function MetricsTable({ rows }: { rows: [string, Metrics][] }) {
  return (
    <div className="table-container">
      <table>
        <caption className="visually-hidden">Requests by what they were</caption>
        <thead>
          <tr>
            <th scope="col">Period</th><th scope="col">HTTP requests</th><th scope="col">Authorised checks</th><th scope="col">Unique operations</th><th scope="col">Replays</th>
            <th scope="col">Business refusals</th><th scope="col">Technical throttles</th><th scope="col">Unavailable (503)</th><th scope="col">Invalid</th><th scope="col">Identity or permission</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, m]) => (
            <tr key={label}>
              <th scope="row">{label}</th><td>{m.httpRequests}</td><td>{m.authorisedChecks}</td><td>{m.uniqueOperations}</td><td>{m.replays}</td>
              <td>{m.businessRefusals}</td><td>{m.technicalThrottles}</td><td>{m.unavailable}</td><td>{m.invalidRequests}</td><td>{m.authorityRefusals}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const metadata: Metadata = { title: "Operations" };
export const dynamic = "force-dynamic";

const LANE_LABEL = { AUTHENTICATED_HUMAN: "Signed-in person", AUTHORISED_AGENT: "Authorised agent", DECLARED_AGENT: "Agent without permission", UNTRUSTED: "Not identified" } as const;
const CAP: Record<string, string> = {
  view_tax_code: "View tax code",
  claim_job_expenses: "Claim WFH relief",
  update_employment: "Update employment",
  change_refund_account: "Change refund account",
  change_address: "Change address",
  view_claim_status: "View claim status",
  respond_to_query: "Answer HMRC question",
  check_claim_progress: "Scheduled progress check",
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
  const [s, people] = await Promise.all([opsSummary(), capacityByPerson()]);
  const lim = currentLimits();
  // The queue of claims received for later processing (issue #21): how many in each state, and anything that failed.
  const queueCounts = await prisma.transaction.groupBy({ by: ["status"], _count: { _all: true } });
  const queued = (st: string) => queueCounts.find((c) => c.status === st)?._count._all ?? 0;
  const oldestWaiting = await prisma.transaction.findFirst({ where: { status: "QUEUED" }, orderBy: { receivedAt: "asc" }, select: { receivedAt: true } });
  const failed = await prisma.transaction.findMany({ where: { status: "FAILED" }, orderBy: { failedAt: "desc" }, take: 20 });
  return (
    <div>
      {live && <meta httpEquiv="refresh" content="3" />}
      <h1>Traffic by lane</h1>
      <p className="ops-toolbar">
        <span>API and web requests to this service.</span>
        {live ? <a href="/ops">Auto-refresh on (3s) · turn off</a> : <a href="/ops?live=1">Turn on auto-refresh</a>}
      </p>

      <h2>Last 60 seconds</h2>
      <LaneTable rows={s.lastMinute} caption="Requests in the last minute by lane" />
      <h2>Last 24 hours</h2>
      <LaneTable rows={s.lastDay} caption="Requests in the last day by lane" />

      <h2>What the requests were</h2>
      <p>
        Traffic and business decisions are counted separately. A throttle is about load and can be retried; a business refusal is a decision about the transaction.
        Authorised checks are GOV.UK Delegate saying yes, which spends nothing.
      </p>
      <MetricsTable rows={[["Last 60 seconds", s.metricsLastMinute], ["Last 24 hours", s.metricsLastDay]]} />

      <h2>Traffic limits by cost class (per minute)</h2>
      <p>These protect HMRC, and never decide whether a claim is allowed. Operator is the agent or session sending traffic; person is who it is about; service is all of HMRC.</p>
      <div className="table-container">
        <table>
          <caption className="visually-hidden">Per-minute traffic limits by cost class and scope</caption>
          <thead><tr><th scope="col">Cost class</th><th scope="col">Operator: person’s session</th><th scope="col">Operator: agent</th><th scope="col">Person, whoever acts</th><th scope="col">Service</th></tr></thead>
          <tbody>
            {COST_CLASSES.map((c) => (
              <tr key={c}><th scope="row">{COST_LABEL[c]}</th><td>{lim.operator.human[c]}</td><td>{lim.operator.agent[c]}</td><td>{lim.principal[c]}</td><td>{lim.service[c]}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>Per person, whoever acts: {Object.values(PRINCIPAL_WINDOWS).map((w) => `${w.label.toLowerCase()}: ${w.limit}`).join("; ")}.</p>

      <h2>Lane policy</h2>
      <div className="table-container">
        <table className="lane-key">
          <thead><tr><th scope="col">Lane</th><th scope="col">Identified by</th><th scope="col">Limit</th><th scope="col">Response</th></tr></thead>
          <tbody>
            <tr><th scope="row">Signed-in person</th><td>GOV.UK One Login session</td><td>{lim.operator.human.all}/min</td><td>Full service; 429 with Retry-After if exceeded</td></tr>
            <tr><th scope="row">Authorised agent</th><td>Agent token, checked with GOV.UK Delegate per request</td><td>{lim.operator.agent.all}/min</td><td>Full API, JSON errors; 429 with Retry-After if exceeded</td></tr>
            <tr><th scope="row">Agent without permission</th><td>Signed with Web Bot Auth</td><td>{LANE_LIMITS.DECLARED_AGENT}/min</td><td>Structured refusal pointing to the proper route</td></tr>
            <tr><th scope="row">Not identified</th><td>None</td><td>{LANE_LIMITS.UNTRUSTED}/min</td><td>{UNTRUSTED_DELAY_MS / 1000}s delay, plain-text refusal, web challenge</td></tr>
          </tbody>
        </table>
      </div>

      <h2>Capacity by person</h2>
      <p>
        Business rules belong to the person whose authority is used, not to each agent or session. This is whose authority was spent in the last
        24 hours, and how many agents and delegations HMRC could tell apart doing it. A hidden session shows as no agent at all, and still
        spends its person’s limits.
      </p>
      <div className="table-container">
        <table>
          <caption className="visually-hidden">Requests by person, last 24 hours</caption>
          <thead>
            <tr>
              <th scope="col">Person</th><th scope="col">Requests</th><th scope="col">Allowed</th><th scope="col">Refused by business rules</th><th scope="col">Held back for traffic</th>
              <th scope="col">Refused for other reasons</th><th scope="col">Agents told apart</th><th scope="col">Delegations told apart</th>
            </tr>
          </thead>
          <tbody>
            {people.length === 0 && <tr><td colSpan={8}>None in the last 24 hours.</td></tr>}
            {people.map((p) => (
              <tr key={p.subject}>
                <th scope="row" className="mono">…{p.subject.slice(-8)}</th><td>{p.requests}</td><td>{p.allowed}</td><td>{p.atLimit}</td><td>{p.throttled}</td>
                <td>{p.refusedOther}</td><td>{p.agents}</td><td>{p.delegations}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Claims received for later processing</h2>
      <p>HMRC stores these before answering 202, and a worker records them. A failed claim is kept here with the reason; the person is only told it could not be recorded.</p>
      <div className="table-container">
        <table>
          <caption className="visually-hidden">Received claims by state</caption>
          <thead><tr><th scope="col">Queued</th><th scope="col">Processing</th><th scope="col">Completed</th><th scope="col">Failed</th><th scope="col">Oldest waiting since</th></tr></thead>
          <tbody><tr><td>{queued("QUEUED")}</td><td>{queued("PROCESSING")}</td><td>{queued("COMPLETED")}</td><td>{queued("FAILED")}</td><td>{oldestWaiting ? fmtTime(oldestWaiting.receivedAt) : "—"}</td></tr></tbody>
        </table>
      </div>
      {failed.length > 0 && (
        <div className="table-container">
          <table>
            <caption className="visually-hidden">Failed claims</caption>
            <thead><tr><th scope="col">Receipt</th><th scope="col">Person</th><th scope="col">Attempts</th><th scope="col">Last error</th><th scope="col">Failed</th></tr></thead>
            <tbody>
              {failed.map((f) => (
                <tr key={f.id}><th scope="row" className="mono">{f.id}</th><td className="mono">…{f.subject.slice(-8)}</td><td>{f.attempts} of {f.maxAttempts}</td><td className="mono">{f.lastError ?? "—"}</td><td>{f.failedAt ? fmtTime(f.failedAt) : "—"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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

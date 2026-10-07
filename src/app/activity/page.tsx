import type { Metadata } from "next";
import { activitySummary } from "@/lib/activity";
import { capabilityLabel } from "@/lib/capabilities";
import { LANE_LIMITS } from "@/lib/config";
import { fmtTime } from "../format";

export const metadata: Metadata = { title: "Agent activity" };
export const dynamic = "force-dynamic";

const LANE_LABEL = { AUTHORISED_AGENT: "Authorised agent", AUTHENTICATED_HUMAN: "Authenticated human", UNTRUSTED: "Untrusted" } as const;
const pct = (n: number) => `${Math.round(n * 100)}%`;

export default async function Activity() {
  const s = await activitySummary();
  return (
    <div>
      <h1>Agent activity</h1>
      <p className="lead">Declared agent transactions can be measured directly because the agent identifies itself and the authority it is using.</p>
      <p className="small">Last 24 hours. Figures count transactions by identified delegates.</p>

      <dl className="route-totals">
        <div><dt>Total agent transactions</dt><dd>{s.total}</dd></div>
        <div><dt>Allowed</dt><dd>{s.allowed}</dd></div>
        <div><dt>Denied</dt><dd>{s.denied}</dd></div>
        <div><dt>Authenticated delegates</dt><dd>{s.authenticatedDelegates}</dd></div>
        <div><dt>Principals represented</dt><dd>{s.principalsRepresented}</dd></div>
      </dl>

      <div className="inset-text">
        <h2 style={{ marginTop: 0, fontSize: "1.5rem" }}>What this tells us</h2>
        <p>This view measures activity using the trusted agent route. It does not claim to identify all automated activity or all AI-assisted submissions.</p>
        <p>Activity outside the trusted route still needs conventional traffic, abuse and research methods. A high number for one delegate is a prompt to look, not a finding of fraud.</p>
      </div>

      <h2>Per delegate</h2>
      <div className="table-container">
        <table>
          <thead><tr><th scope="col">Delegate</th><th scope="col">Transactions</th><th scope="col">Unique principals</th><th scope="col">Denial rate</th></tr></thead>
          <tbody>
            {s.perDelegate.map((d) => (
              <tr key={d.name}><th scope="row">{d.name}</th><td>{d.transactions}</td><td>{d.principals}</td><td>{pct(d.denialRate)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Per principal</h2>
      <div className="table-container">
        <table>
          <thead><tr><th scope="col">Principal</th><th scope="col">Transactions</th></tr></thead>
          <tbody>{s.perPrincipal.map((p) => <tr key={p.name}><th scope="row">{p.name}</th><td>{p.transactions}</td></tr>)}</tbody>
        </table>
      </div>

      <h2>Requests by capability</h2>
      <div className="table-container">
        <table>
          <thead><tr><th scope="col">Action</th><th scope="col">Attempts</th><th scope="col">Allowed</th></tr></thead>
          <tbody>
            {s.perCapability.map((c) => (
              <tr key={c.capability}><th scope="row">{capabilityLabel(c.capability)}</th><td>{c.total}</td><td>{c.allowed}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Trusted and untrusted lanes</h2>
      <p>Outside the trusted lane is not the same as malicious. It includes people who have not signed in, assistive technology, agents that have not integrated yet, and hostile automation. The difference below is an incentive to identify yourself, not a verdict.</p>
      <div className="table-container">
        <table className="lane-table">
          <thead>
            <tr><th scope="col">Lane</th><th scope="col">Last 24 hours</th><th scope="col">Allowed</th><th scope="col">Simulated limit</th><th scope="col">Machine-readable errors</th><th scope="col">Authority audit trail</th></tr>
          </thead>
          <tbody>
            {s.lanes.map((l) => (
              <tr key={l.lane}>
                <th scope="row">{LANE_LABEL[l.lane]}</th>
                <td>{l.total}</td>
                <td>{l.allowed}</td>
                <td>{LANE_LIMITS[l.lane]} / minute</td>
                <td>{l.lane === "UNTRUSTED" ? "No" : "Yes"}</td>
                <td>{l.lane === "UNTRUSTED" ? "No" : "Yes"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Transactions</h2>
      <div className="table-container">
        <table className="activity-table">
          <thead>
            <tr><th scope="col">Time</th><th scope="col">Principal</th><th scope="col">Delegate</th><th scope="col">Service</th><th scope="col">Action</th><th scope="col">Decision</th><th scope="col">Reason</th></tr>
          </thead>
          <tbody>
            {s.events.map((e) => (
              <tr key={e.id}>
                <td>{fmtTime(e.timestamp)}</td>
                <td>{e.principal?.displayName ?? "—"}</td>
                <td>{e.delegate?.name ?? (e.presentedClientId ? `Unknown (${e.presentedClientId})` : e.lane === "AUTHENTICATED_HUMAN" ? "None (person)" : "Not identified")}</td>
                <td>{e.service?.name ?? "—"}</td>
                <td>{e.capability ? capabilityLabel(e.capability) : "—"}</td>
                <td><span className={`decision decision--${e.decision.toLowerCase()}`}>{e.decision === "ALLOW" ? "Allowed" : "Denied"}</span></td>
                <td className="mono">{e.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

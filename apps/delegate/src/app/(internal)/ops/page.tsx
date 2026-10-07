import type { Metadata } from "next";
import { activitySummary } from "@/lib/activity";
import { capabilityLabel } from "@/lib/capabilities";
import { fmtTime } from "@/lib/format";

export const metadata: Metadata = { title: "Agent activity" };
export const dynamic = "force-dynamic";

const pct = (n: number) => `${Math.round(n * 100)}%`;

export default async function Activity() {
  const s = await activitySummary();
  return (
    <div>
      <h1>Agent activity</h1>
      <p className="small">Authorisation checks from all connected services, last 24 hours.</p>

      <dl className="route-totals">
        <div><dt>Checks</dt><dd>{s.total}</dd></div>
        <div><dt>Allowed</dt><dd>{s.allowed}</dd></div>
        <div><dt>Refused</dt><dd>{s.denied}</dd></div>
        <div><dt>Agents</dt><dd>{s.authenticatedDelegates}</dd></div>
        <div><dt>People represented</dt><dd>{s.principalsRepresented}</dd></div>
      </dl>

      <h2>Per agent</h2>
      <div className="table-container">
        <table>
          <thead><tr><th scope="col">Agent</th><th scope="col">Checks</th><th scope="col">People</th><th scope="col">Refusal rate</th></tr></thead>
          <tbody>
            {s.perDelegate.map((d) => (
              <tr key={d.name}><th scope="row">{d.name}</th><td>{d.transactions}</td><td>{d.principals}</td><td>{pct(d.denialRate)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Per service and action</h2>
      <div className="table-container">
        <table>
          <thead><tr><th scope="col">Action</th><th scope="col">Checks</th><th scope="col">Allowed</th></tr></thead>
          <tbody>
            {s.perCapability.map((c) => (
              <tr key={c.capability}><th scope="row">{capabilityLabel(c.capability)}</th><td>{c.total}</td><td>{c.allowed}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Checks</h2>
      <div className="table-container">
        <table className="activity-table">
          <thead>
            <tr><th scope="col">Time</th><th scope="col">Person</th><th scope="col">Agent</th><th scope="col">Service</th><th scope="col">Action</th><th scope="col">Decision</th><th scope="col">Reason</th></tr>
          </thead>
          <tbody>
            {s.events.map((e) => (
              <tr key={e.id}>
                <td>{fmtTime(e.timestamp)}</td>
                <td>{e.principal?.displayName ?? "—"}</td>
                <td>{e.delegate?.name ?? (e.presentedClientId ? `Unknown (${e.presentedClientId})` : "Not identified")}</td>
                <td>{e.service?.name ?? "—"}</td>
                <td>{e.capability ? capabilityLabel(e.capability) : "—"}</td>
                <td><span className={`decision decision--${e.decision.toLowerCase()}`}>{e.decision === "ALLOW" ? "Allowed" : "Refused"}</span></td>
                <td className="mono">{e.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

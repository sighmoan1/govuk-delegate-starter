import { SCENARIOS, fill, type AttemptClass, type ScenarioResult } from "@/lib/swarm";

// Plain SVG, no library. Colours are the validated categorical slots 1 to 4 plus a neutral for failures; the outcome is
// also in the legend, the tooltips and the table, never colour alone.
const W = 720, LABEL = 250, PAD = 12, ROW = 46, BAR = 22;

type Bucket = { id: string; label: string; classes: AttemptClass[]; fill: string; on: string };
export const BUCKETS: Bucket[] = [
  { id: "received", label: "Claim received, or the original receipt returned", classes: ["received", "replay"], fill: "var(--series-1)", on: "#ffffff" },
  { id: "answered", label: "Answered (tax-code and status lookups)", classes: ["ok"], fill: "var(--series-3)", on: "var(--ink-on-fill)" },
  { id: "nothing", label: "Refused as a duplicate or by a business rule: nothing created", classes: ["duplicate", "refused"], fill: "var(--series-2)", on: "var(--ink-on-fill)" },
  { id: "later", label: "Held back for traffic or unavailable: try again later (429, 503)", classes: ["throttled", "unavailable"], fill: "var(--series-4)", on: "var(--ink-on-fill)" },
  { id: "other", label: "No authority, or failed", classes: ["no_authority", "failed"], fill: "#8a8a85", on: "#ffffff" },
];

const nameOf = (r: ScenarioResult) => SCENARIOS.find((s) => s.id === r.id)?.name ?? r.id;
const setupOf = (r: ScenarioResult, n: number) => fill(SCENARIOS.find((s) => s.id === r.id)?.short ?? "", n);
const countOf = (r: ScenarioResult, b: Bucket) => b.classes.reduce((t, c) => t + r.transport.total[c], 0);

/** A bar segment: square at the baseline side, 4px-rounded at the data end if it is the last. */
function segment(x: number, y: number, w: number, h: number, roundEnd: boolean) {
  if (!roundEnd) return `M${x},${y}h${w}v${h}h${-w}z`;
  const r = Math.min(4, w, h / 2);
  return `M${x},${y}h${w - r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0 1 ${-r},${r}h${-(w - r)}z`;
}

/** How every request ended, one bar per scenario. This is technical load: requests, not claims. */
export function AttemptChart({ results, n }: { results: ScenarioResult[]; n: number }) {
  const rows = results.filter((r) => !r.error);
  const plot = W - LABEL - PAD * 2 - 44;
  const height = rows.length * ROW + 8;
  const summary = rows.map((r) => `${nameOf(r)}: ${r.transport.attempts} requests, ${r.transport.byOp.claim.received} claims received`).join("; ");
  return (
    <figure id="attempts" className="viz-root" aria-labelledby="attempts-t">
      <figcaption>
        <strong id="attempts-t">How every request ended</strong>
        <span className="viz-sub">Technical load, measured. One bar per scenario; each bar is all the requests that scenario sent, retries included, so the bars differ in length. Requests are not claims.</span>
      </figcaption>
      <ul className="viz-legend" aria-label="How requests ended">
        {BUCKETS.map((b) => <li key={b.id}><span className="viz-swatch" style={{ background: b.fill }} aria-hidden="true" />{b.label}</li>)}
      </ul>
      <div className="viz-scroll" tabIndex={0} role="group" aria-label="How every request ended, scrollable">
        <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={`How every request ended. ${summary}.`} className="viz-svg">
          {rows.map((r, i) => {
            const y = i * ROW + (ROW - BAR) / 2;
            const total = r.transport.attempts || 1;
            const widest = Math.max(...rows.map((x) => x.transport.attempts), 1);
            let x = LABEL;
            const last = [...BUCKETS].reverse().find((b) => countOf(r, b) > 0)?.id;
            return (
              <g key={r.id}>
                <text x={0} y={y + BAR / 2 - 3} className="viz-axis viz-axis--strong">{nameOf(r)}</text>
                <text x={0} y={y + BAR / 2 + 12} className="viz-axis">{setupOf(r, n)}</text>
                <line x1={LABEL} x2={LABEL} y1={y - 4} y2={y + BAR + 4} className="viz-baseline" />
                {BUCKETS.map((b) => {
                  const count = countOf(r, b);
                  if (!count) return null;
                  const full = (count / widest) * plot;
                  const w = Math.max(full - 2, 1);
                  const sx = x;
                  x += full;
                  return (
                    <g key={b.id}>
                      <path d={segment(sx, y, w, BAR, b.id === last)} fill={b.fill}><title>{`${nameOf(r)} · ${b.label}: ${count} of ${total} requests`}</title></path>
                      {w >= 30 && <text x={sx + w / 2} y={y + BAR / 2 + 4} textAnchor="middle" className="viz-value" fill={b.on}>{count}</text>}
                    </g>
                  );
                })}
                <text x={x + 6} y={y + BAR / 2 + 4} className="viz-axis">{total}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <details className="viz-table">
        <summary>Show as a table</summary>
        <table>
          <caption className="visually-hidden">How every request ended</caption>
          <thead><tr><th scope="col">Scenario</th>{BUCKETS.map((b) => <th key={b.id} scope="col">{b.label}</th>)}<th scope="col">All requests</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}><th scope="row">{nameOf(r)}</th>{BUCKETS.map((b) => <td key={b.id}>{countOf(r, b)}</td>)}<td>{r.transport.attempts}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

const QW = 720, QH = 180, QL = 44, QB = 28, QT = 10, QR = 12;

/** Claims received but not yet recorded, over time, for the scenarios with a real queue to watch. */
export function QueueChart({ results, n }: { results: ScenarioResult[]; n: number }) {
  const rows = results.filter((r) => !r.error && r.timeline.length > 1 && Math.max(...r.timeline.map((s) => s.open)) > 1);
  if (rows.length === 0) return null;
  const tMax = Math.max(...rows.flatMap((r) => r.timeline.map((s) => s.t)), 1000);
  const yMax = Math.max(...rows.flatMap((r) => r.timeline.map((s) => s.open)), 1);
  const x = (t: number) => QL + (t / tMax) * (QW - QL - QR);
  const y = (v: number) => QT + (1 - v / yMax) * (QH - QT - QB);
  const colour = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];
  const summary = rows.map((r) => `${nameOf(r)}: up to ${Math.max(...r.timeline.map((s) => s.open))} claims waiting, empty after about ${(Math.max(...r.timeline.filter((s) => s.open > 0).map((s) => s.t), 0) / 1000).toFixed(0)} seconds`).join("; ");
  return (
    <figure id="queue" className="viz-root" aria-labelledby="queue-t">
      <figcaption>
        <strong id="queue-t">Claims waiting to be recorded</strong>
        <span className="viz-sub">Service outcome, measured. Every claim was received straight away and recorded gradually. The queue empties; nothing is dropped.</span>
      </figcaption>
      <ul className="viz-legend" aria-label="Scenarios">
        {rows.map((r, i) => <li key={r.id}><span className="viz-swatch" style={{ background: colour[i % 4] }} aria-hidden="true" />{nameOf(r)}: {setupOf(r, n)}</li>)}
      </ul>
      <div className="viz-scroll" tabIndex={0} role="group" aria-label="Claims waiting over time, scrollable">
        <svg viewBox={`0 0 ${QW} ${QH}`} role="img" aria-label={`Claims waiting to be recorded over time. ${summary}.`} className="viz-svg">
          <line x1={QL} x2={QW - QR} y1={y(0)} y2={y(0)} className="viz-baseline" />
          <line x1={QL} x2={QL} y1={QT} y2={y(0)} className="viz-baseline" />
          <text x={QL - 6} y={y(yMax) + 4} textAnchor="end" className="viz-axis">{yMax}</text>
          <text x={QL - 6} y={y(0) + 4} textAnchor="end" className="viz-axis">0</text>
          <text x={QL} y={QH - 6} className="viz-axis">0 s</text>
          <text x={QW - QR} y={QH - 6} textAnchor="end" className="viz-axis">{(tMax / 1000).toFixed(0)} s</text>
          {rows.map((r, i) => (
            <polyline key={r.id} fill="none" stroke={colour[i % 4]} strokeWidth={2} points={r.timeline.map((s) => `${x(s.t).toFixed(1)},${y(s.open).toFixed(1)}`).join(" ")}>
              <title>{`${nameOf(r)}: claims waiting over time`}</title>
            </polyline>
          ))}
        </svg>
      </div>
      <details className="viz-table">
        <summary>Show as a table</summary>
        <table>
          <caption className="visually-hidden">Claims waiting to be recorded</caption>
          <thead><tr><th scope="col">Scenario</th><th scope="col">Most waiting at once</th><th scope="col">Seconds until none waiting</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}><th scope="row">{nameOf(r)}</th><td>{Math.max(...r.timeline.map((s) => s.open))}</td><td>{r.server?.queue.drainMs != null ? (r.server.queue.drainMs / 1000).toFixed(1) : "–"}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

export const armName = nameOf;

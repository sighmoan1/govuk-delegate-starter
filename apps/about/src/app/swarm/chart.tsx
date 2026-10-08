import { ARMS, BUCKETS, type ArmResult, type BucketId, type Counts } from "@/lib/swarm";

// One stacked bar per arm: how the same workload ended. Plain SVG, no library.
// Colours are the validated categorical slots 1–4, in order; the outcome is also
// in the legend, the tooltips and the table, never colour alone.
const W = 720, LABEL = 200, PAD = 12, ROW = 44, BAR = 22;

const FILL: Record<BucketId, string> = { accepted: "var(--series-1)", capacity: "var(--series-2)", evidence: "var(--series-3)", other: "var(--series-4)" };
const ON_FILL: Record<BucketId, string> = { accepted: "#ffffff", capacity: "var(--ink-on-fill)", evidence: "var(--ink-on-fill)", other: "var(--ink-on-fill)" };

/** A bar segment: square at the baseline side, 4px-rounded at the data end if it is the last. */
function segment(x: number, y: number, w: number, h: number, roundEnd: boolean) {
  if (!roundEnd) return `M${x},${y}h${w}v${h}h${-w}z`;
  const r = Math.min(4, w, h / 2);
  return `M${x},${y}h${w - r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0 1 ${-r},${r}h${-(w - r)}z`;
}

export function SwarmChart({ id, title, subtitle, arms, pick, n }: {
  id: string; title: string; subtitle: string; arms: ArmResult[]; pick: (a: ArmResult) => Counts; n: number;
}) {
  const plot = W - LABEL - PAD * 2 - 36;
  const height = arms.length * ROW + 8;
  const summary = arms.map((a) => `${armName(a.arm)}: ${pick(a).accepted} accepted of ${n}`).join("; ");
  return (
    <figure id={id} className="viz-root" aria-labelledby={`${id}-t`}>
      <figcaption>
        <strong id={`${id}-t`}>{title}</strong>
        <span className="viz-sub">{subtitle}</span>
      </figcaption>
      <ul className="viz-legend" aria-label="Outcomes">
        {BUCKETS.map((b) => (
          <li key={b.id}><span className="viz-swatch" style={{ background: FILL[b.id] }} aria-hidden="true" />{b.label}</li>
        ))}
      </ul>
      <div className="viz-scroll" tabIndex={0} role="group" aria-label={`${title}, scrollable`}>
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={`${title}. ${summary}.`} className="viz-svg">
        {arms.map((a, i) => {
          const c = pick(a);
          const y = i * ROW + (ROW - BAR) / 2;
          let x = LABEL;
          const last = [...BUCKETS].reverse().find((b) => c[b.id] > 0)?.id;
          return (
            <g key={a.arm}>
              <text x={0} y={y + BAR / 2 - 3} className="viz-axis viz-axis--strong">{armName(a.arm)}</text>
              <text x={0} y={y + BAR / 2 + 12} className="viz-axis">{ARMS.find((r) => r.id === a.arm)!.setup.replace(/N/g, String(n))}</text>
              <line x1={LABEL} x2={LABEL} y1={y - 4} y2={y + BAR + 4} className="viz-baseline" />
              {BUCKETS.map((b) => {
                const count = c[b.id];
                if (!count) return null;
                const full = (count / n) * plot;
                const w = Math.max(full - 2, 1); // 2px surface gap between segments
                const sx = x;
                x += full;
                return (
                  <g key={b.id}>
                    <path d={segment(sx, y, w, BAR, b.id === last)} fill={FILL[b.id]}>
                      <title>{`${armName(a.arm)} · ${b.label}: ${count} of ${n}`}</title>
                    </path>
                    {w >= 30 && <text x={sx + w / 2} y={y + BAR / 2 + 4} textAnchor="middle" className="viz-value" fill={ON_FILL[b.id]}>{count}</text>}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      </div>
      <details className="viz-table">
        <summary>Show as a table</summary>
        <table>
          <caption className="visually-hidden">{title}</caption>
          <thead>
            <tr><th scope="col">Arm</th>{BUCKETS.map((b) => <th key={b.id} scope="col">{b.label}</th>)}</tr>
          </thead>
          <tbody>
            {arms.map((a) => (
              <tr key={a.arm}><th scope="row">{armName(a.arm)}</th>{BUCKETS.map((b) => <td key={b.id}>{pick(a)[b.id]}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

export const armName = (id: string) => ARMS.find((a) => a.id === id)?.name ?? id;

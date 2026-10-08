import type { Metadata } from "next";
import { urls } from "@/lib/config";
import { ARMS, shape, type SwarmRun } from "@/lib/swarm";
import { run } from "./actions";
import { SwarmChart, armName } from "./chart";

export const metadata: Metadata = { title: "Can a swarm beat the system?" };

export default async function Swarm({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const { r } = await searchParams;
  let result: SwarmRun | null = null;
  try { result = r ? JSON.parse(Buffer.from(r, "base64url").toString()) : null; } catch { result = null; }

  return (
    <div>
      <span className="caption">Scenario 5</span>
      <h1>Can a swarm beat the system?</h1>
      <div className="two-thirds">
        <p className="lead">
          One person authorises one agent, or a hundred. Or runs a hundred copies of themselves in their own browser, where HMRC can’t see
          they’re agents at all. Do they get a hundred times the service?
        </p>
        <p>
          <strong>What it shows:</strong> they don’t. The limits belong to the person whose authority is being used, not to each agent,
          session or browser. So it doesn’t matter how many actors there are, or whether HMRC can detect them. Identity decides what an
          agent may do. Capacity belongs to the person.
        </p>
      </div>

      <h2>Four ways to run the same workload</h2>
      <div className="table-container">
        <table className="lanes-table">
          <thead><tr><th scope="col">Arm</th><th scope="col">Set-up</th><th scope="col">What we expect</th></tr></thead>
          <tbody>
            <tr><th scope="row">A</th><td>1 person, 1 agent, doing all of it</td><td>The baseline</td></tr>
            <tr><th scope="row">B</th><td>1 person, N agents: N delegations under one permission from her</td><td>The same as A</td></tr>
            <tr><th scope="row">B′</th><td>1 person, N hidden sessions: her own session, copied. HMRC sees no agent at all.</td><td>The same as A, with no detection</td></tr>
            <tr><th scope="row">C</th><td>N different people, each with one agent</td><td>N times as much. Each is a separate person with separate permission.</td></tr>
          </tbody>
        </table>
      </div>
      <p>
        The workload is N attempts to claim working-from-home relief and N tax-code checks, shared out among the actors. Every request goes
        to HMRC’s real API, and every agent request is checked with GOV.UK Delegate. Each run uses new synthetic people, so you can run it
        again without resetting.
      </p>

      <form action={run} className="swarm-form">
        <div className="form-group">
          <label className="label" htmlFor="n">Size of the swarm (N)</label>
          <select className="select" id="n" name="n" defaultValue={result?.n ?? 100}>
            <option value="10">10</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </div>
        <button className="button" type="submit">Run all four</button>
      </form>
      <p className="small">
        Open <a href={`${urls.hmrc}/ops?live=1`}>HMRC’s operations view</a> in another window to see the limits being spent, by person.
      </p>

      {result && <Results result={result} />}
    </div>
  );
}

function Results({ result }: { result: SwarmRun }) {
  const { n, arms } = result;
  const [a, b, bp, c] = ["A", "B", "Bp", "C"].map((id) => arms.find((x) => x.arm === id)!);
  const same = (f: (x: typeof a) => string) => f(a) === f(b) && f(a) === f(bp);
  const claimsSame = same((x) => shape(x.claims));
  const viewsSame = same((x) => shape(x.views));
  const failed = arms.reduce((t, x) => t + x.claims.other + x.views.other, 0);
  return (
    <section id="results" aria-labelledby="results-h">
      <h2 id="results-h">Results, with N = {n}</h2>
      <p className="lead">
        {claimsSame && viewsSame ? (
          <>A, B and B′ got <strong>exactly the same</strong>: {a.claims.accepted} claim accepted and {a.views.accepted} tax-code views, however many agents or sessions were used. C, with {n} separate people, got {c.claims.accepted} claims and {c.views.accepted} views.</>
        ) : (
          <>A, B and B′ did <strong>not</strong> get the same result. That’s a failure of the rule, and the numbers below show where.</>
        )}
      </p>
      {failed > 0 && (
        <p role="note"><strong>{failed} requests ended in something other than a clear accept or refuse</strong> (shown in yellow). Check the table, and HMRC’s operations view.</p>
      )}

      <SwarmChart id="claims" title="Claims for working-from-home relief" subtitle={`${n} attempts per arm. A person can claim once per tax year unless they send new evidence.`} arms={arms} pick={(x) => x.claims} n={n} />
      <SwarmChart id="views" title="Tax-code checks" subtitle={`${n} attempts per arm. A person can check 60 times an hour.`} arms={arms} pick={(x) => x.views} n={n} />

      <h2>How to read it</h2>
      <ul>
        <li><strong>A, B and B′ match.</strong> Spreading one person’s work across more agents, or hiding the agents entirely, adds nothing. B′ is the important one: HMRC sees only Sam’s own session, and still applies Sam’s limits.</li>
        <li><strong>C is different on purpose.</strong> {n} people each gave their own permission, so they have {n} sets of limits. That’s ordinary use of the service, not a swarm.</li>
        <li><strong>Where the limits are decided.</strong> HMRC applies the per-person rules (claims, checks, open cases, bank changes). GOV.UK Delegate adds a shared budget per person and caps how deep a chain of agents can go.</li>
      </ul>
      <details>
        <summary>Actual counts and reasons</summary>
        <div className="table-container">
          <table>
            <thead><tr><th scope="col">Arm</th><th scope="col">Actors</th><th scope="col">Claims</th><th scope="col">Tax-code checks</th><th scope="col">Time</th></tr></thead>
            <tbody>
              {arms.map((x) => (
                <tr key={x.arm}>
                  <th scope="row">{armName(x.arm)} <span className="small">({ARMS.find((r) => r.id === x.arm)!.setup.replace(/N/g, String(n))})</span></th>
                  <td>{x.actors}</td>
                  <td>{Object.entries(x.claims.raw).map(([k, v]) => `${k} ${v}`).join(", ")}</td>
                  <td>{Object.entries(x.views.raw).map(([k, v]) => `${k} ${v}`).join(", ")}</td>
                  <td>{(x.ms / 1000).toFixed(1)}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

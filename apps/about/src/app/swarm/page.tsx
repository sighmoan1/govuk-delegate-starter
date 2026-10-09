import type { Metadata } from "next";
import { urls } from "@/lib/config";
import { DEMO_LIMITS, SCENARIOS, fill, type ScenarioResult, type SwarmRun } from "@/lib/swarm";
import { loadRun } from "@/lib/swarm-store";
import { ASSUMPTIONS, SIM_SEED, simulateAll, type SimResult } from "@/lib/swarm-sim";
import { run } from "./actions";
import { AttemptChart, QueueChart, armName } from "./chart";

export const metadata: Metadata = { title: "Can a swarm beat the system?" };

const Real = () => <span className="prov prov--real">Measured: real integration run</span>;
const Limit = () => <span className="prov prov--limit">Depends on a demo-only limit</span>;
const Sim = () => <span className="prov prov--sim">Simulated, not measured</span>;

export default async function Swarm({ searchParams }: { searchParams: Promise<{ r?: string; n?: string }> }) {
  const { r, n } = await searchParams;
  const result = loadRun(r);
  const expired = !!r && !result;
  const size = Number(n);

  return (
    <div>
      <span className="caption">Scenario 4</span>
      <h1>Can a swarm beat the system?</h1>
      <div className="two-thirds">
        <p className="lead">
          A hundred requests might be one claim sent a hundred times. They might be a hundred people’s claims. Those need very different
          treatment, and counting “requests allowed” can’t tell them apart.
        </p>
        <p>
          <strong>What it shows:</strong> one person’s claim is one claim, however many agents, sessions or retries carry it. The extra requests are
          absorbed and create nothing. A hundred claims for a hundred different people are a hundred legitimate claims, so they are received
          and recorded gradually, not turned away. Traffic that costs the service something is slowed with a 429 that says when to come back,
          and the people behind it keep their claims.
        </p>
        <p>
          The page keeps two kinds of number apart, because mixing them gives the wrong idea of harm. <strong>Technical load</strong> is what reached
          HMRC and what it cost: requests, checks with GOV.UK Delegate, 429 and 503 answers, back-end work. <strong>Service outcomes</strong> are what
          happened to the claims: received, waiting, recorded, how long it took. A check that says “yes” is not a claim. A request that was answered is
          not a claim. A 429 is not a lost claim.
        </p>
      </div>

      <h2>How to read the labels</h2>
      <ul>
        <li><Real /> Counted from a run of the actual prototype just now: HMRC’s API, GOV.UK Delegate’s check, a real queue and worker, fresh synthetic people. The numbers will differ a little each time. They depend on the machine it runs on.</li>
        <li><Limit /> The result is shaped by a limit chosen for the demo, such as “60 tax-code lookups an hour” or “one claim per tax year”. These are illustrative and provisional. They are not decided policy, and no test here asserts them as a rule.</li>
        <li><Sim /> From a seeded model, the same every time, that never touches HMRC or Delegate. It compares ways of protecting a service. It is not evidence of how a real service behaves.</li>
      </ul>

      <h2>Seven ways to send the same wish</h2>
      <div className="table-container">
        <table className="lanes-table">
          <thead><tr><th scope="col">Scenario</th><th scope="col">Set-up</th><th scope="col">What we expect</th></tr></thead>
          <tbody>
            {SCENARIOS.map((s) => (
              <tr key={s.id}><th scope="row">{s.name}{s.added ? <span className="small"> (new)</span> : null}</th><td>{s.setup}</td><td>{s.expect}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Every request goes to HMRC’s real API, and every agent request is checked with GOV.UK Delegate. In A to C and E, the claim attempts use
        the asynchronous route (<code>Prefer: respond-async</code> with an <code>Idempotency-Key</code>), so “received” means a <code>202</code> receipt and “recorded”
        means the worker has finished. Each run uses new synthetic people, so you can run it again without resetting. A request that stands for a claim someone
        wants (C, D, and the claims in E and F) waits as long as <code>Retry-After</code> says after a 429 or 503 and sends the same request again. Redundant copies, retry storms and polls do not.
      </p>

      <form action={run} className="swarm-form">
        <div className="form-group">
          <label className="label" htmlFor="n">Size of the swarm (N)</label>
          <select className="select" id="n" name="n" defaultValue={size || 100}>
            <option value="10">10</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </div>
        <button className="button" type="submit">Run all seven</button>
      </form>
      <p className="small">
        N = 100 can take a couple of minutes, because clients wait when HMRC asks them to. Open <a href={`${urls.hmrc}/ops?live=1`}>HMRC’s operations view</a> in another window to
        watch the traffic.
      </p>

      {expired && <p role="note"><strong>That run is no longer here.</strong> The about site keeps the last few runs in memory and has been restarted since. Run it again.</p>}
      {result && <Results run={result} />}

      <Simulation sims={simulateAll()} />

      <h2>What this does not show</h2>
      <ul>
        <li><strong>It is not a load test.</strong> The services run as development servers on one machine with a five-connection database pool. Timings show the shape (a queue that fills and empties, a worker that takes milliseconds), not capacity.</li>
        <li><strong>Authority checks are not free, and nothing here limits them.</strong> HMRC asks GOV.UK Delegate before it decides anything else, so a throttle further in turns away requests that have already cost a check. The check API has no limits of its own yet.</li>
        <li><strong>The limits are placeholders.</strong> Changing a number changes the tables. The point of the page is how the accounting is kept (technical load apart from outcomes, duplicates apart from demand), not which numbers are right.</li>
        <li><strong>Unknown traffic is still unknown.</strong> Nothing here helps with traffic that has no identity and no person behind it. That needs abuse controls of its own, which this prototype only stands in for.</li>
      </ul>
    </div>
  );
}

// ── Real results.

const ms = (v: number | null | undefined) => (v == null ? "–" : v < 1000 ? `${Math.round(v)} ms` : `${(v / 1000).toFixed(1)} s`);
const pair = (s: { n: number; p50: number; max: number }) => (s.n ? `${ms(s.p50)} / ${ms(s.max)}` : "–");

function Results({ run: res }: { run: SwarmRun }) {
  const { n, results } = res;
  const by = Object.fromEntries(results.map((r) => [r.id, r])) as Record<string, ScenarioResult | undefined>;
  const failed = results.filter((r) => r.error);
  const broken = results.flatMap((r) => r.invariants.filter((i) => !i.ok).map((i) => ({ r, i })));
  const rec = (id: string) => by[id]?.server?.queue.received ?? 0;
  const dup = (id: string) => (by[id] ? by[id]!.transport.byOp.claim.duplicate + by[id]!.transport.byOp.claim.replay : 0);
  const d = by.D, e = by.E, f = by.F;
  return (
    <section id="results" aria-labelledby="results-h">
      <h2 id="results-h">Results, with N = {n}</h2>
      <p><Real /> <Limit /></p>
      <p className="lead">
        {rec("A") === 1 && rec("B") === 1 && rec("Bp") === 1 ? (
          <>One person’s claim stayed <strong>one claim</strong> however it was sent: by one agent, {n} agents or {n} hidden sessions, it was received once, and the other attempts created nothing. {n} different people made <strong>{rec("C")}</strong>.</>
        ) : (
          <>One person’s claim did <strong>not</strong> stay one claim in every arm. That is a failure, and the checks below show where.</>
        )}
      </p>
      {broken.length > 0 && (
        <div className="inset-text" role="note">
          <strong>{broken.length} check{broken.length === 1 ? "" : "s"} did not hold.</strong> {broken.map(({ r, i }) => `${armName(r)}: ${i.text}`).join(" ")}
        </div>
      )}
      {failed.length > 0 && <p role="note"><strong>{failed.map((r) => `${armName(r)}: ${r.error}`).join("; ")}</strong></p>}

      <h3>Service outcomes: what happened to the claims</h3>
      <p className="small">
        “Wanted” is what the people in the scenario set out to claim: one for A, B and B′, however many attempts; one each for the others. The two columns after
        it are claims HMRC actually holds. Duplicates are requests for a claim HMRC already had; they changed nothing.
      </p>
      <div className="table-container">
        <table>
          <caption className="visually-hidden">Service outcomes by scenario</caption>
          <thead>
            <tr>
              <th scope="col">Scenario</th><th scope="col">Claims wanted</th><th scope="col">Received (202)</th><th scope="col">Recorded</th><th scope="col">Waiting or failed at the end</th>
              <th scope="col">Duplicate requests absorbed</th><th scope="col">Wait for a worker (median / slowest)</th><th scope="col">Worker time per claim (median / slowest)</th><th scope="col">Until all were recorded</th>
            </tr>
          </thead>
          <tbody>
            {results.filter((r) => r.server).map((r) => {
              const q = r.server!.queue;
              return (
                <tr key={r.id}>
                  <th scope="row">{armName(r)}</th><td>{r.demanded}</td><td>{q.received}</td><td>{q.byStatus.COMPLETED ?? 0}</td><td>{q.openNow + (q.byStatus.FAILED ?? 0)}</td>
                  <td>{r.transport.byOp.claim.duplicate + r.transport.byOp.claim.replay}</td><td>{pair(q.waitMs)}</td><td>{pair(q.processingMs)}</td><td>{ms(q.drainMs)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3>Technical load: what it cost</h3>
      <p className="small">
        Requests include every retry. “Authority checks” is how many times HMRC asked GOV.UK Delegate; hidden sessions use no agent credential, so they cause none. Back-end work
        is what passed HMRC’s traffic admission and reached its business layer, by kind.
      </p>
      <div className="table-container">
        <table>
          <caption className="visually-hidden">Technical load by scenario</caption>
          <thead>
            <tr>
              <th scope="col">Scenario</th><th scope="col">Requests sent</th><th scope="col">of which retries</th><th scope="col">Authority checks</th><th scope="col">Held back (429)</th><th scope="col">Unavailable (503)</th>
              <th scope="col">Back-end work admitted</th><th scope="col">Median request time at HMRC</th>
            </tr>
          </thead>
          <tbody>
            {results.filter((r) => r.server?.events).map((r) => {
              const ev = r.server!.events!;
              const w = ev.admittedWorkByCostClass;
              return (
                <tr key={r.id}>
                  <th scope="row">{armName(r)}</th><td>{r.transport.attempts}</td><td>{r.transport.retries}</td><td>{ev.authorisedChecks}</td>
                  <td>{ev.technicalThrottles}{Object.keys(ev.throttlesByScope).length ? <span className="small"> ({Object.entries(ev.throttlesByScope).map(([k, v]) => `${k} ${v}`).join(", ")})</span> : null}</td>
                  <td>{ev.unavailable}</td>
                  <td>{w.write ?? 0} writes, {w.expensive_query ?? 0} lookups, {(w.read ?? 0) + (w.status_poll ?? 0)} reads</td><td>{ms(ev.latencyMs.p50)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AttemptChart results={results} n={n} />
      <QueueChart results={results} n={n} />

      <h3>What each scenario shows</h3>
      <ul>
        <li><strong>A, B and B′: one wish, many requests.</strong> {by.A && <>In A, {by.A.transport.byOp.claim.duplicate} attempts were refused as duplicates{by.A.transport.byOp.claim.throttled ? `, ${by.A.transport.byOp.claim.throttled} were held back for traffic (a repeat of a claim that is already in costs that person nothing)` : ""}, and {rec("A")} claim was received. </>}The same happened with {n} agents and with {n} hidden sessions.{by.A && by.A.transport.byOp.view.throttled > 0 ? ` The tax-code lookups in the same scenarios were held back once the person’s hourly allowance was spent (${by.A.transport.byOp.view.throttled} of ${by.A.transport.byOp.view.ok + by.A.transport.byOp.view.throttled} in A). They change nothing.` : ""} <Limit /></li>
        <li><strong>C: {n} people, {n} claims.</strong> {n} separately authorised people each got a claim. Each is a different person with a claim of their own, and {by.C?.server?.queue.byStatus.COMPLETED ?? 0} are recorded. {by.C?.server && <>The queue took {ms(by.C.server.queue.drainMs)} to empty, with {ms(by.C.server.queue.processingMs.p50)} of actual work per claim at the median.</>}</li>
        <li><strong>D: the burst.</strong> {d?.server && <>{d.transport.attempts} requests (every claim sent twice) became {rec("D")} claims, all received and {d.server.queue.byStatus.COMPLETED ?? 0} recorded. {d.transport.byOp.claim.replay} repeats got the original receipt. {d.transport.retries ? `${d.transport.retries} requests were held back (429 or 503) and sent again after Retry-After. ` : ""}</>}{d?.bystander && d.bystander.note} Claims are recorded in the order they arrive, so someone arriving mid-burst waits behind the claims already queued. Whether a different order or a different limit would help is what the simulation below compares.</li>
        <li><strong>E: the retry storm.</strong> {e?.server && <>{e.transport.attempts} requests for one claim made {rec("E")} claim. {e.transport.byOp.claim.replay} came back as the original receipt, {e.transport.byOp.claim.throttled} were held back for traffic, and none created anything. A retry is a read, not a second submission.</>}</li>
        <li><strong>F: the status-poll flood.</strong> {f?.server && <>{f.transport.attempts} requests asked about two claims. {f.transport.total.throttled} were held back with 429 by the person’s own traffic limits. {f.bystander?.ok ? "The claim itself was untouched, and the bystander was not affected. " : "The bystander was affected: see the checks below. "}{f.bystander?.note} <Limit /></>}</li>
      </ul>

      <details>
        <summary>Checks: what was asserted for each scenario</summary>
        <div className="details-text">
          {results.map((r) => (
            <div key={r.id}>
              <h4>{armName(r)}</h4>
              <ul>
                {r.invariants.map((i) => <li key={i.id}><strong>{i.ok ? "Held:" : "Did not hold:"}</strong> {i.text}</li>)}
                {r.error && <li><strong>Error:</strong> {r.error}</li>}
              </ul>
              {r.limits.length > 0 && <p className="small">Demo-only limits that shaped it: {r.limits.map((l) => DEMO_LIMITS[l]).join("; ")}.</p>}
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}

// ── The simulation.

const s1 = (v: number | null) => (v == null ? "–" : v < 10 ? v.toFixed(1) : String(Math.round(v)));

function Simulation({ sims }: { sims: SimResult[] }) {
  const get = (w: string, p: string) => sims.find((s) => s.workload.id === w)!.rows.find((r) => r.policy.id === p)!.metrics;
  const none = (w: string) => get(w, "none");
  const burst = { none: none("distinct_burst"), agent: get("distinct_burst", "agent_60"), asBuilt: get("distinct_burst", "as_built"), provider: get("distinct_burst", "fair_provider"), person: get("distinct_burst", "fair_person") };
  const heavy = { none: none("heavy_person"), person: get("heavy_person", "fair_person") };
  const flood = { none: none("poll_flood"), person: get("poll_flood", "person_throttle"), agent: get("poll_flood", "agent_60") };
  const storm = { none: none("retry_storm"), agent: get("retry_storm", "agent_60") };
  return (
    <section id="simulation" aria-labelledby="simulation-h">
      <h2 id="simulation-h">Which protections keep the legitimate demand? <Sim /></h2>
      <p>
        A deterministic model with seed {SIM_SEED}: the same input gives the same table every time. It replays the same waves of requests against different
        protections and counts the same things. Nothing here ran against HMRC. It uses these assumptions, and the tables move if you change them
        (<code>swarm-sim.ts</code>): {ASSUMPTIONS.workers} workers recording a claim in {ASSUMPTIONS.serviceMs[0]} to {ASSUMPTIONS.serviceMs[1]} ms each, clients that wait out <code>Retry-After</code> and
        try up to {ASSUMPTIONS.maxRetries} more times, one-minute counting windows, and a person-level limit of {ASSUMPTIONS.personPerMinute.write} writes and {ASSUMPTIONS.personPerMinute.read} reads a minute (HMRC’s current
        defaults). Held the same in every row, because it is how HMRC behaves rather than something under test: a repeat of a request HMRC already holds is answered from the stored
        outcome, a second claim for something it already has creates nothing, authority is checked first, and a person’s claims are recorded one at a time.
      </p>
      <div className="inset-text">
        <strong>Reading it.</strong> “Wanted → received → recorded” is the legitimate demand. A protection that lowers the request count but loses demand, or makes the people behind
        the demand wait much longer, has not reduced harm. It has moved it. Every request a throttle turns away has already cost an authority check, because the check comes first.
      </div>

      {sims.map((s) => (
        <div key={s.workload.id}>
          <h3>{s.workload.name}</h3>
          <p>{s.workload.story}</p>
          {s.workload.hypothetical && <p className="small"><strong>Hypothetical.</strong> {s.workload.hypothetical}</p>}
          <div className="table-container">
            <table>
              <caption className="visually-hidden">{s.workload.name}: protections compared (simulated)</caption>
              <thead>
                <tr>
                  <th scope="col">Protection</th><th scope="col">Requests</th><th scope="col">Authority checks</th><th scope="col">Held back (429)</th><th scope="col">Writes / reads admitted</th>
                  <th scope="col">Wanted → received → recorded</th><th scope="col">Duplicates absorbed</th><th scope="col">People with one claim: median / slowest wait</th><th scope="col">Signed-in bystander</th><th scope="col">Most waiting at once</th>
                </tr>
              </thead>
              <tbody>
                {s.rows.map(({ policy, metrics: m }) => (
                  <tr key={policy.id}>
                    <th scope="row">{policy.name}<br /><span className="small">{policy.builtInHmrc ? "HMRC has this" : policy.id === "none" ? "Baseline" : "Not built"}. {policy.what}</span></th>
                    <td>{m.attempts}</td><td>{m.authorityChecks}</td><td>{m.throttled429}</td><td>{m.admittedWrites} / {m.admittedReads}</td>
                    <td>{m.demanded} → {m.received} → {m.completed}</td><td>{m.duplicatesAbsorbed}</td><td>{s1(m.lightP50S)} s / {s1(m.lightP95S)} s</td><td>{m.bystanderS == null ? "–" : `${s1(m.bystanderS)} s`}</td><td>{m.peakQueue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <h3>What the model says</h3>
      <p className="small">Each line is worked out from the tables above, so it stays true if the assumptions change.</p>
      <ul>
        <li>
          <strong>An agent-level throttle penalises the agent’s other users.</strong> With 100 people through one agent, a 60-a-minute limit holds back {burst.agent.throttled429} requests
          (against {burst.none.throttled429} with no controls). The claims still arrive ({burst.agent.received} of {burst.agent.demanded}) but the slowest single-claim person waits {s1(burst.agent.lightP95S)} s
          instead of {s1(burst.none.lightP95S)} s{burst.agent.lost > 0 ? `, and ${burst.agent.lost} give up` : ""}. In the retry storm it holds back {storm.agent.throttled429} requests, and the slowest of the
          twenty other people through the same agent waits {s1(storm.agent.lightP95S)} s instead of {s1(storm.none.lightP95S)} s.
        </li>
        <li>
          <strong>A person-level technical throttle leaves distinct people alone.</strong> The same burst sees {burst.asBuilt.throttled429} held back, because each person sends little. In the poll flood it
          holds back {flood.person.throttled429} of the flood’s requests ({flood.person.floodPollsThrottled} of {flood.person.floodPolls}) and {flood.person.legitPollsThrottled} of the legitimate checks. Admitted reads fall from {flood.none.admittedReads} to {flood.person.admittedReads}.
        </li>
        <li>
          <strong>Fair scheduling protects people from a heavy user, not from a crowd.</strong> When one person has many items, the median wait for everyone else falls from {s1(heavy.none.lightP50S)} s to {s1(heavy.person.lightP50S)} s.
          When the crowd is many different people sent by one provider, scheduling by person {Math.abs((burst.person.bystanderS ?? 0) - (burst.none.bystanderS ?? 0)) < 0.5 ? "changes nothing for" : "changes the wait of"} the bystander ({s1(burst.person.bystanderS)} s against {s1(burst.none.bystanderS)} s). Scheduling
          fairly between providers first gives the bystander {s1(burst.provider.bystanderS)} s, but HMRC has not built that and it needs a decision about what a provider is owed.
        </li>
        <li>
          <strong>Nothing here lets a duplicate create a claim.</strong> In every row of every table, claims received never exceed the claims wanted ({sims.every((s) => s.rows.every((r) => r.metrics.businessActions <= r.metrics.demanded)) ? "true in this run of the model" : "not true: check the model"}). That is idempotency and the one-claim rule, held constant. The protections only decide who is slowed.
        </li>
      </ul>
    </section>
  );
}


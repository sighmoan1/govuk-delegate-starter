import type { Metadata } from "next";
import { urls } from "@/lib/config";
import { StartFrom } from "../start-from";
import { agentBurst, botBurst, webBurst, type Burst } from "./actions";

export const metadata: Metadata = { title: "Government prioritises people and authorised agents" };

const WHO = {
  bot: "Unregistered bot, 40 API requests at once",
  agent: "Example AI acting for Sam, 40 API requests at once",
  web: "Not signed in, loading HMRC’s “Your tax” page 10 times",
} as const;

export default async function Prioritise({ searchParams }: { searchParams: Promise<{ reset?: string; r?: string }> }) {
  const { reset, r } = await searchParams;
  let b: Burst | null = null;
  try { b = r ? JSON.parse(Buffer.from(r, "base64url").toString()) : null; } catch { b = null; }

  return (
    <div>
      <span className="caption">Scenario 3</span>
      <h1>Government prioritises people and authorised agents</h1>
      <div className="two-thirds">
        <p className="lead">HMRC can tell three kinds of traffic apart, and treat them differently.</p>
        <p>
          <strong>What it shows:</strong> a signed-in person and an agent with permission get a fast, full service. Automation that won’t
          identify itself gets tight limits, slow plain-text refusals and a check on the website. That makes the approved route the easy one,
          instead of government trying to spot AI after the fact.
        </p>
      </div>

      <div className="table-container">
        <table className="lanes-table">
          <thead><tr><th scope="col">Lane</th><th scope="col">How HMRC knows</th><th scope="col">What it gets</th></tr></thead>
          <tbody>
            <tr><th scope="row">Signed-in person</th><td>GOV.UK One Login</td><td>The full service</td></tr>
            <tr><th scope="row">Authorised agent</th><td>The agent’s own identity, plus a check with GOV.UK Delegate on every request</td><td>A structured API, clear errors, high limits, a full audit trail</td></tr>
            <tr><th scope="row">Not identified</th><td>Neither of the above</td><td>5 requests a minute, a 1.5 second delay, plain-text refusals, a check on the website</td></tr>
          </tbody>
        </table>
      </div>

      <StartFrom back="/prioritise-trusted-traffic" recommended="with-access" done={reset} />

      <h2>Send traffic to HMRC</h2>
      <p>Open <a href={`${urls.hmrc}/ops?live=1`}>HMRC’s operations view</a> in another window to watch from HMRC’s side.</p>
      <div className="console-grid">
        <div>
          <h3>Unregistered bot</h3>
          <p>No identity, no permission. What a scraper, or an agent that hasn’t integrated, would do.</p>
          <form action={botBurst}><button className="button" type="submit">Send 40 requests as a bot</button></form>
        </div>
        <div>
          <h3>Example AI, for Sam</h3>
          <p>Its own identity, acting for Sam with the permission she gave on GOV.UK.</p>
          <form action={agentBurst}><button className="button" type="submit">Send 40 requests as Example AI</button></form>
        </div>
        <div>
          <h3>Someone not signed in</h3>
          <p>Loading HMRC’s pages over and over without signing in.</p>
          <form action={webBurst}><button className="button" type="submit">Load the page 10 times</button></form>
        </div>
      </div>

      {b && (
        <section id="results" aria-labelledby="results-h" aria-live="polite">
          <h2 id="results-h">{WHO[b.who]}</h2>
          {b.error ? (
            <div className="error-summary"><p>{b.error}</p></div>
          ) : (
            <>
              {b.who !== "web" && <p className="big">{b.gotData} of {b.n} got the data</p>}
              <table className="results">
                <thead><tr><th scope="col">What happened</th><th scope="col">Requests</th></tr></thead>
                <tbody>{Object.entries(b.counts).map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}</tbody>
              </table>
              {b.who !== "web" && <p>Median time to an answer: {b.medianMs} ms.</p>}
            </>
          )}
        </section>
      )}

      <h2>Also measured</h2>
      <p>
        Because authorised agents identify themselves, government can see which agents act for how many people, doing what, and how often
        they’re refused. See <a href={`${urls.delegate}/ops`}>GOV.UK Delegate’s operations view</a>.
      </p>
    </div>
  );
}

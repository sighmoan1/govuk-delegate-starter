import type { Metadata } from "next";
import Link from "next/link";
import { urls } from "@/lib/config";
import { floodAsAgent, floodAsBot, type FloodSummary } from "./actions";

export const metadata: Metadata = { title: "Demo console" };

const WHO = { bot: "Unregistered bot", agent: "Example AI, acting for Sam" } as const;

export default async function Console({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const { r } = await searchParams;
  let s: FloodSummary | null = null;
  try { s = r ? JSON.parse(Buffer.from(r, "base64url").toString()) : null; } catch { s = null; }

  return (
    <div>
      <div className="two-thirds">
        <h1>Demo console</h1>
        <p className="lead">Send a burst of 40 requests to HMRC’s “view tax code” API and see who gets through.</p>
        <p>Open <a href={`${urls.hmrc}/ops?live=1`}>HMRC’s operations view</a> in another window to watch from HMRC’s side.</p>
      </div>

      <div className="console-grid">
        <div>
          <h2>Unregistered bot</h2>
          <p>No identity, no permission. What a scraper or an agent that hasn’t integrated would do.</p>
          <form action={floodAsBot}><button className="button" type="submit">Send 40 as the bot</button></form>
        </div>
        <div>
          <h2>Example AI</h2>
          <p>Its own identity, acting for Sam with the permission she gave on GOV.UK. Needs steps 2 and 3 of <Link href="/demo">the demo</Link> first.</p>
          <form action={floodAsAgent}><button className="button" type="submit">Send 40 as Example AI</button></form>
        </div>
      </div>

      {s && (
        <section id="results" aria-labelledby="results-h" aria-live="polite">
          <h2 id="results-h">{WHO[s.who]}</h2>
          {s.error ? (
            <div className="error-summary"><p>{s.error}</p></div>
          ) : (
            <>
              <p className="big">{s.gotData} of {s.n} got the data</p>
              <table className="results">
                <thead><tr><th scope="col">HMRC answered</th><th scope="col">Requests</th></tr></thead>
                <tbody>
                  {Object.entries(s.counts).map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}
                </tbody>
              </table>
              <p>Median time to an answer: {s.medianMs} ms.</p>
            </>
          )}
        </section>
      )}
    </div>
  );
}

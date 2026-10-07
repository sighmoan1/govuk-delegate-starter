import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { floodAs, knownPerson } from "../actions";

export const metadata: Metadata = { title: "Flood test" };

const LABEL = { AGENT: "Example AI, registered, with Sam’s permission", BOT: "Unregistered bot, no identity" } as const;

export default async function FloodPage() {
  const known = await knownPerson();
  const results = await prisma.floodResult.findMany({ orderBy: { createdAt: "desc" }, take: 6 });
  return (
    <>
      <h1>Flood test</h1>
      <p className="xai-intro">
        Send 40 requests at once to HMRC’s “view tax code” API, as the unregistered bot and as Example AI. Open{" "}
        <a href={`${config.hmrcUrl}/ops?live=1`}>HMRC’s operations view</a> in another window to watch it from the service’s side.
      </p>
      <div className="flood-grid">
        <div>
          <h2>Unregistered bot</h2>
          <p className="muted">No identity. Gets the unidentified lane: 5 a minute, 1.5 s each, plain text.</p>
          <form action={floodAs}><input type="hidden" name="persona" value="BOT" /><button className="xai-button" type="submit">Send 40 as the bot</button></form>
        </div>
        <div>
          <h2>Example AI</h2>
          <p className="muted">
            {known ? "Its own token, acting for Sam with the permission Sam gave. HMRC checks Delegate on every one." : "Run the task first so Sam can give permission; until then HMRC will refuse it as having no permission."}
          </p>
          <form action={floodAs}><input type="hidden" name="persona" value="AGENT" /><button className="xai-button" type="submit">Send 40 as Example AI</button></form>
        </div>
      </div>

      <section id="results" aria-labelledby="results-h">
        <h2 id="results-h">Results</h2>
        {results.length === 0 ? <p>None yet.</p> : (
          <table>
            <thead><tr><th scope="col">Sent as</th><th scope="col">Got the data</th><th scope="col">What happened</th><th scope="col">Median time to an answer</th></tr></thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.id}>
                  <th scope="row">{LABEL[r.persona]}</th>
                  <td><strong>{(r.counts as Record<string, number>)["200 allowed"] ?? 0} of {r.n}</strong></td>
                  <td>{Object.entries(r.counts as Record<string, number>).map(([k, v]) => <div key={k}>{v} × {k}</div>)}</td>
                  <td>{r.medianMs} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

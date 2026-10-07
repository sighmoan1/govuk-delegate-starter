import Link from "next/link";
import { urls } from "@/lib/config";
import { resetDemo } from "@/lib/reset";

const SCENARIOS = [
  {
    href: "/use-an-agent",
    n: 1,
    title: "Sam asks her assistant to claim tax relief",
    text: "An AI assistant gets Sam’s permission through GOV.UK, then claims working-from-home tax relief with HMRC for her.",
  },
  {
    href: "/manage-who-can-act",
    n: 2,
    title: "Sam manages who can act for her",
    text: "In her GOV.UK account, Sam sees which agents can act for her and what they’ve done, and removes access.",
  },
  {
    href: "/prioritise-trusted-traffic",
    n: 3,
    title: "Government prioritises people and authorised agents",
    text: "HMRC gives signed-in people and authorised agents a fast route, and slows down automation that won’t identify itself.",
  },
];

export default async function Overview({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const { reset } = await searchParams;
  return (
    <div>
      <h1>GOV.UK Delegate</h1>
      <p className="claim">Make legitimate automation easier than illegitimate automation.</p>

      <div className="two-thirds">
        <p className="lead">A person who has signed in with GOV.UK One Login gives an agent limited, revocable permission to act for them.</p>
        <p>
          A service like HMRC then needs to add very little to let that agent through on the same route as a signed-in person. Because a
          trusted route exists, government can put more friction on traffic that won’t identify itself. That steers automation into the
          approved route instead of letting it flood services.
        </p>
      </div>

      <h2>Three scenarios</h2>
      <p>Each one stands on its own and can reset everything to the right starting point.</p>
      <ul className="scenarios">
        {SCENARIOS.map((s) => (
          <li key={s.href}>
            <span className="caption">Scenario {s.n}</span>
            <h3><Link href={s.href}>{s.title}</Link></h3>
            <p>{s.text}</p>
          </li>
        ))}
      </ul>

      <h2>The four systems</h2>
      <ul className="systems">
        <li>
          <h3><a href={urls.oneLogin}>GOV.UK One Login</a></h3>
          <p>Signs Sam in, for both GOV.UK and HMRC.</p>
          <p className="added">Added: nothing.</p>
        </li>
        <li>
          <h3><a href={`${urls.delegate}/account/delegates`}>GOV.UK Delegate</a></h3>
          <p>Part of the GOV.UK account. Records who may act for whom, and answers services’ checks.</p>
          <p className="added">Added: the whole thing. It is the new service.</p>
        </li>
        <li>
          <h3><a href={urls.hmrc}>HMRC</a></h3>
          <p>Claim tax relief for your job expenses. People use it signed in; agents use its API.</p>
          <p className="added">Added: one registration and one middleware file.</p>
        </li>
        <li>
          <h3><a href={urls.agent}>Example AI</a></h3>
          <p>Sam’s AI assistant. Acts with its own identity, never Sam’s.</p>
          <p className="added">Added: one registration.</p>
        </li>
      </ul>

      <section id="start" className="start-from" aria-labelledby="reset-h">
        <h2 id="reset-h">Reset the demo</h2>
        {reset && <p className="start-from__done" role="status">Reset. Everything is back to the start.</p>}
        <p>Put GOV.UK Delegate, HMRC and Example AI back as they started. Each scenario page also has its own starting points.</p>
        <form action={resetDemo}>
          <input type="hidden" name="mode" value="clean" />
          <input type="hidden" name="back" value="/" />
          <button className="button button--secondary" type="submit">Reset everything</button>
        </form>
      </section>
    </div>
  );
}

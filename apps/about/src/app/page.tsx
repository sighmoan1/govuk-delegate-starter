import Link from "next/link";
import { urls } from "@/lib/config";

export default function Overview() {
  return (
    <div>
      <h1>GOV.UK Delegate</h1>
      <p className="claim">Make legitimate automation easier than illegitimate automation.</p>

      <div className="two-thirds">
        <p className="lead">A person who has signed in with GOV.UK One Login gives an agent limited, revocable permission to act for them.</p>
        <p>
          A service like HMRC then needs to add very little to let that agent through on the same route as a signed-in person. Because a
          trusted route exists, government can put more friction on traffic that will not identify itself. That steers automation into the
          approved route instead of letting it flood services.
        </p>
        <p>The pattern is copied from HMRC’s agent authorisation: an agent asks, the person approves, a relationship is recorded, the service checks it, and the person can remove it.</p>
      </div>

      <h2>Four systems</h2>
      <p>Each one runs separately and they talk to each other over HTTP, as they would in real life.</p>
      <ul className="systems">
        <li>
          <h3><a href={urls.oneLogin}>GOV.UK One Login</a></h3>
          <span className="port">Official simulator</span>
          <p>Signs Sam in, for both GOV.UK and HMRC.</p>
          <p className="added">Added: nothing.</p>
        </li>
        <li>
          <h3><a href={`${urls.delegate}/account/delegates`}>GOV.UK Delegate</a></h3>
          <span className="port">Part of the GOV.UK account</span>
          <p>Asks Sam what an agent may do, records it, and answers one question for services: may this agent do this for this person?</p>
          <p className="added">Added: the whole thing. It is the new service.</p>
        </li>
        <li>
          <h3><a href={urls.hmrc}>HMRC</a></h3>
          <span className="port">Claim tax relief for your job expenses</span>
          <p>An ordinary service. People use it signed in. Agents use its API. Unidentified traffic meets friction.</p>
          <p className="added">Added: one registration and one middleware file.</p>
        </li>
        <li>
          <h3><a href={urls.agent}>Example AI</a></h3>
          <span className="port">A third-party assistant</span>
          <p>Sam’s AI assistant. Asks for permission through GOV.UK, then acts with its own identity, never Sam’s.</p>
          <p className="added">Added: one registration. It asks for permission and sends its own token.</p>
        </li>
      </ul>

      <Link className="button" href="/demo">Run the demo</Link>
      <p><Link href="/how-it-works">How it works</Link> · <Link href="/why">Why we are exploring this</Link></p>
    </div>
  );
}

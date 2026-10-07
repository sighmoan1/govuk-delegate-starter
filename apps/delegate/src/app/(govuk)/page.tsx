import Link from "next/link";
import { config } from "@/lib/config";

export default async function Start({ searchParams }: { searchParams: Promise<{ signin?: string }> }) {
  const { signin } = await searchParams;
  const systems = [
    {
      name: "GOV.UK One Login",
      url: config.oneLoginSimulatorUrl,
      role: "Signs people in. Unchanged: both Delegate and HMRC rely on it, and the person it identifies is the same in both.",
      added: "Nothing.",
    },
    {
      name: "GOV.UK Delegate",
      url: "/",
      role: "New. Asks a signed-in person what an agent may do for them, records it, and answers one question for any service: may this agent do this for this person?",
      added: "The whole service: a consent screen, an account page, a registry, a check API and an activity log.",
    },
    {
      name: "HMRC: Claim tax relief for working from home",
      url: config.hmrcUrl,
      role: "An ordinary service. People use it signed in; agents use its API. Traffic that will not identify itself meets friction.",
      added: "Registered once with Delegate. One check in front of its API. Nothing in its own sign-in changed.",
    },
    {
      name: "Example AI",
      url: config.agentUrl,
      role: "A third-party agent. Asks the person for permission through Delegate, then acts with its own identity, never the person’s.",
      added: "Registered once. Asks for permission; sends its token with each call.",
    },
  ];
  return (
    <div>
      {signin === "failed" && (
        <div className="error-summary" role="alert">
          <h2>Sign in did not complete</h2>
          <p>We could not confirm your sign-in with the GOV.UK One Login simulator. Try again.</p>
        </div>
      )}
      <div className="two-thirds">
        <h1>GOV.UK Delegate</h1>
        <p className="lead">Let a person who has signed in with GOV.UK One Login give an agent limited, revocable permission to act for them.</p>
        <p>
          The idea is to make <strong>legitimate automation easier than illegitimate automation</strong>. An agent that identifies itself and
          holds permission gets the same happy path as a signed-in person. Automation that will not identify itself can be given more
          friction. Both are things government can measure.
        </p>
        <p>This prototype runs four separate systems, talking to each other over HTTP, so you can see where the boundaries are and how little each existing system has to change.</p>
      </div>

      <h2>The four systems</h2>
      <div className="table-container">
        <table className="systems-table">
          <thead><tr><th scope="col">System</th><th scope="col">What it does</th><th scope="col">What it had to add</th></tr></thead>
          <tbody>
            {systems.map((s) => (
              <tr key={s.name}>
                <th scope="row"><a href={s.url}>{s.name}</a></th>
                <td>{s.role}</td>
                <td>{s.added}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="two-thirds">
        <h2>The demo, in seven steps</h2>
        <p>You are <strong>Sam</strong> throughout. The agent acts by itself. Each step links you onward.</p>
        <ol className="step-list">
          <li><a href={config.hmrcUrl}>HMRC</a>: sign in with One Login and see your tax code. You could claim yourself. Instead, you ask your assistant.</li>
          <li><a href={config.agentUrl}>Example AI</a>: run the task. It signs in to Delegate as itself and asks for permission to act for you with HMRC.</li>
          <li>GOV.UK Delegate: sign in, choose what to allow, press Allow. You are sent back to the agent.</li>
          <li>Example AI: it carries on by itself. Your tax code is read and the claim is made. Then it tries something you did not allow, and HMRC refuses.</li>
          <li>Example AI › Flood test: 40 requests as an unregistered bot, 40 as the registered agent. <a href={`${config.hmrcUrl}/ops`}>HMRC’s operations view</a> shows who got through, and how fast.</li>
          <li><Link href="/account/delegates">Who can act for you</Link>: remove its access. The agent’s next attempt is refused.</li>
          <li>HMRC: sign in again. The claim is there, attributed to Example AI acting for you.</li>
        </ol>
        <a className="button" href={config.hmrcUrl} role="button" draggable="false">Start at HMRC</a>
        <p><Link href="/about">Why we are exploring this</Link> · <Link href="/activity">Declared agent activity</Link></p>
      </div>
    </div>
  );
}

import Link from "next/link";
import { urls } from "@/lib/config";
import { resetDemo } from "@/lib/reset";

const SCENARIOS = [
  {
    href: "/manage-who-can-act",
    n: 1,
    title: "Sam manages who can act for her",
    text: "In her GOV.UK account, Sam sees which agents can act for her and what they’ve done, and removes access.",
  },
  {
    href: "/prioritise-trusted-traffic",
    n: 2,
    title: "Government prioritises people and authorised agents",
    text: "HMRC gives signed-in people and authorised agents a fast route, and slows down automation that won’t identify itself.",
  },
  {
    href: "/which-route",
    n: 3,
    title: "Which route do agents choose?",
    text: "Real agents, given a simple job, with a proper route and an improper one. What HMRC could see, and what they did.",
  },
  {
    href: "/swarm",
    n: 4,
    title: "Can a swarm beat the system?",
    text: "A hundred requests for one claim are one claim, however many agents, sessions or retries carry them. A hundred claims from a hundred people may be legitimate demand: they are received and recorded gradually. Technical load and outcomes are measured apart.",
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
          HMRC checks that permission before an agent acts and records what happens. Consent, agent sessions, discovery,
          receipts and service controls support the journey. This gives legitimate automation an explicit route; whether
          it improves outcomes beyond a good service API remains a question for our experiments.
        </p>
      </div>

      <h2>Identify the agent. Authorise the mandate. Limit the principal.</h2>
      <div className="two-thirds">
        <p>
          Government doesn’t need to detect every AI agent to control agentic flooding. Where it can, agents identify themselves and get
          explicit permission from the person they act for. HMRC applies its business rules to the person and handles repeated
          submissions as one operation. It manages technical traffic separately, so genuine demand can be distinguished
          from retries and excessive polling. Asking Delegate about authority spends no citizen allowance.
        </p>
      </div>
      <div className="table-container">
        <table className="lanes-table">
          <thead><tr><th scope="col"></th><th scope="col">The question</th><th scope="col">Decided by</th><th scope="col">Can it be faked or hidden?</th></tr></thead>
          <tbody>
            <tr><th scope="row">Identity</th><td>Who or what is making the request?</td><td>A signature, registered credentials, or self-declaration</td><td>Yes. An agent in Sam’s own browser looks like Sam.</td></tr>
            <tr><th scope="row">Authority</th><td>What has the person allowed it to do?</td><td>GOV.UK Delegate, checked on every request</td><td>No</td></tr>
            <tr><th scope="row">Business limits</th><td>How much may everyone using this person’s authority do, together?</td><td>Limits on the person, applied by the service doing the work</td><td>No. They follow the person, however many actors there are.</td></tr>
          </tbody>
        </table>
      </div>
      <p>
        Detection is evidence, not the security boundary. Identity decides what an agent may do and whether it’s shown the proper route. It
        never gives more capacity, and the limits work when detection fails.
      </p>

      <p>A tiny synthetic council service also uses the same consent and authority interfaces, with its own service key,
        capability catalogue and case records. It checks case ownership itself. This demonstrates service integration;
        production identity correlation remains <a href="https://github.com/sighmoan1/govuk-delegate-starter/issues/35">an open question</a>.</p>
      <p><a href="/ask-your-agent">Ask your own agent</a> to find out about a claim, submit one, answer HMRC’s question with you, or keep you posted.</p>

      <h2>What would count as evidence?</h2>
      <div className="two-thirds">
        <p>
          This prototype demonstrates a possible authorised route. We have not yet demonstrated that it improves government
          outcomes or costs. The key experiment compares a <strong>good agent API using service-local delegation</strong>
          with <strong>the same API plus GOV.UK Delegate</strong>, measuring the extra value of independent citizen control
          alongside additional effort and operating cost.
        </p>
        <p><Link href="/evidence">See our experiments, existing observations and evidence register</Link>.</p>
      </div>

      <p><Link href="/project-status">See what is implemented, what is in review and what remains unproven</Link>.</p>

      <h2>Four scenarios</h2>
      <p>The first two scenarios have starting-point buttons. Route findings show previous observations; the swarm runner creates fresh people.</p>
      <ul className="scenarios">
        {SCENARIOS.map((s) => (
          <li key={s.href}>
            <span className="caption">Scenario {s.n}</span>
            <h3><Link href={s.href}>{s.title}</Link></h3>
            <p>{s.text}</p>
          </li>
        ))}
      </ul>

      <h2>Delegate is not Orchestrate</h2>
      <div className="two-thirds">
        <p>
          GOV.UK Delegate records who a person allows to act and within which limits; it does not tell the assistant
          what tasks to carry out. The person’s assistant plans the work. Government services decide what transactions
          are valid. A possible future Orchestrate could offer provider-neutral task tracking and handoffs, but is
          not part of this prototype.
        </p>
        <p><Link href="/delegate-orchestrate">Explore the Delegate / Orchestrate architecture and responsibilities</Link>.</p>
      </div>

      <h2>The three systems</h2>
      <ul className="systems">
        <li>
          <h3><a href={urls.oneLogin}>GOV.UK One Login</a></h3>
          <p>Signs Sam in, for both GOV.UK and HMRC.</p>
          <p className="added">Prototype sign-in screens and a proxy to the official simulator. Authentication is separate from delegation.</p>
        </li>
        <li>
          <h3><a href={`${urls.delegate}/account/delegates`}>GOV.UK Delegate</a></h3>
          <p>Part of the GOV.UK account. Records who may act for whom, and answers services’ checks.</p>
          <p className="added">Added: the whole thing. It is the new service.</p>
        </li>
        <li>
          <h3><a href={urls.hmrc}>HMRC</a></h3>
          <p>Claim tax relief for your job expenses. People use it signed in; agents use its API.</p>
          <p className="added">Added: authority checks, agent request and session flows, browser guards, discovery, traffic controls, receipts, dispute reconciliation and outcome reporting.</p>
        </li>
      </ul>

      <section id="start" className="start-from" aria-labelledby="reset-h">
        <h2 id="reset-h">Reset the demo</h2>
        {reset && <p className="start-from__done" role="status">Reset. Everything is back to the start.</p>}
        <p>Put GOV.UK Delegate and HMRC citizen fixtures back as they started. Scenarios 1 and 2 also have starting-point buttons; registered catalogue history is retained.</p>
        <form action={resetDemo}>
          <input type="hidden" name="mode" value="clean" />
          <input type="hidden" name="back" value="/" />
          <button className="button button--secondary" type="submit">Reset everything</button>
        </form>
      </section>
    </div>
  );
}

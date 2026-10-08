import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Delegate or Orchestrate?",
  description: "Who owns authority, tasks and transactions in an agent-enabled public service?",
};

const RESPONSIBILITIES = [
  {
    name: "One Login",
    question: "Who is this person?",
    work: "Authenticates the citizen independently of any assistant.",
    status: "In the prototype",
  },
  {
    name: "GOV.UK Delegate",
    question: "Who can act for them, and within which boundaries?",
    work: "Records service-scoped, revocable permission for a representative. Checks current authority, not a task plan.",
    status: "In the prototype; richer mandates proposed",
  },
  {
    name: "The citizen's assistant",
    question: "What does the person want done and how?",
    work: "Interprets the goal, plans the work, calls tools and reports results. Today this role is often supplied by AI providers.",
    status: "Provided outside Delegate",
  },
  {
    name: "Government services",
    question: "Is this transaction valid, and what happens next?",
    work: "Publish what can be delegated, verify authority, apply their rules and process operations. HMRC is mocked here.",
    status: "HMRC mock in the prototype",
  },
  {
    name: "GOV.UK Orchestrate",
    question: "Could a neutral service carry multi-step civic tasks across providers?",
    work: "Might manage durable task records, handoffs between providers or advisers, dependencies and status aggregation.",
    status: "Hypothetical — not a built service",
  },
];

export default function DelegateOrOrchestrate() {
  return (
    <div>
      <div className="two-thirds">
        <h1>Delegate or Orchestrate?</h1>
        <p className="lead">
          Delegate governs <strong>authority</strong>. An assistant, or a possible future Orchestrate service,
          manages <strong>the work</strong>. Departments make <strong>service decisions</strong>.
        </p>
        <p>
          These are different problems. Mixing them would turn a relatively small, reusable authority service into a
          central manager of people's private instructions and every government workflow.
        </p>
      </div>

      <h2>Where the responsibilities sit</h2>
      <div className="table-container">
        <table>
          <thead>
            <tr><th scope="col">Component</th><th scope="col">The question it answers</th><th scope="col">Its role</th><th scope="col">Status</th></tr>
          </thead>
          <tbody>
            {RESPONSIBILITIES.map((item) => (
              <tr key={item.name}>
                <th scope="row">{item.name}</th>
                <td>{item.question}</td>
                <td>{item.work}</td>
                <td>{item.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>The architecture in one picture</h2>
      <div className="boundary-flow" aria-label="Citizen speaks to an assistant; One Login authenticates the citizen; Delegate grants and verifies specific authority; departmental services define and execute transactions. Orchestrate is an optional proposed coordinator, not part of Delegate.">
        <div className="boundary-flow__box">
          <strong>Citizen</strong>
          <p>Goals and instructions to a chosen assistant</p>
        </div>
        <p className="boundary-flow__arrow" aria-hidden="true">↓</p>
        <div className="boundary-flow__box">
          <strong>Assistant / model provider</strong>
          <p>Plan, coordinate, call services, track progress</p>
          <p className="small"><strong>Optional future alternative:</strong> Orchestrate, as a provider-neutral task coordinator</p>
        </div>
        <p className="boundary-flow__arrow" aria-hidden="true">↓ asks for authority / operates within its grant</p>
        <div className="boundary-flow__box boundary-flow__box--authority">
          <strong>GOV.UK Delegate</strong>
          <p>Citizen approves through One Login. Delegate records service-defined capabilities, conditions and revocation.</p>
        </div>
        <p className="boundary-flow__arrow" aria-hidden="true">↕ authority check; results reported back</p>
        <div className="boundary-flow__box boundary-flow__box--service">
          <strong>HMRC · DWP · DVLA · council</strong>
          <p>Each service defines delegable actions, enforces eligibility and safeguards, and executes its own transactions.</p>
        </div>
      </div>
      <p className="small">
        This is the <strong>proposed cross-government architecture</strong>, not a statement that the current prototype
        integrates with DWP or DVLA. Orchestrate is hypothetical.
      </p>

      <h2>Permissions belong to the receiving service</h2>
      <div className="two-thirds">
        <p>
          HMRC should define what &ldquo;submit a claim&rdquo; or &ldquo;change refund bank account&rdquo; means.
          Delegate should receive that service's registered, versioned list of available permissions, present them to
          the citizen and remember the boundaries they approve.
        </p>
        <p>
          A new department should not require us to add its permission names or endpoints to Delegate's source code.
          That's an important decoupling improvement to this prototype, not something we've already built.
        </p>
      </div>

      <h2>Standing authority is not an AI instruction</h2>
      <div className="table-container">
        <table>
          <thead><tr><th scope="col">Private task instruction</th><th scope="col">Enforceable mandate</th></tr></thead>
          <tbody>
            <tr>
              <td>&ldquo;Get my tax sorted and tell me when it's done.&rdquo;</td>
              <td>&ldquo;This assistant may submit my working-from-home claim for tax year 2026–27 for the next 30 days.&rdquo;</td>
            </tr>
            <tr>
              <td>&ldquo;Do the easy parts without bothering me.&rdquo;</td>
              <td>&ldquo;May answer routine questions, but must not change payment details; any confirmation HMRC requires must be obtained.&rdquo;</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        The first column stays with the person's chosen assistant. The second can be held as a structured, revocable grant
        in Delegate and enforced by the service. A purpose label helps the citizen recognise a grant; it cannot create
        rights that the machine-readable grant does not contain.
      </p>

      <h2>What Orchestrate might do that AI providers do not reliably provide</h2>
      <div className="two-thirds">
        <p>
          Model providers already perform much of what we could call orchestration: understanding a request, breaking
          it into steps, using tools and following up. A <em>theoretical</em> government Orchestrate could be useful if
          there is a genuine gap in citizen-controlled continuity across agents, departments and assisted-digital channels.
        </p>
        <ul>
          <li>Preserve progress and case references when someone changes AI provider or needs human assistance.</li>
          <li>Coordinate several independently approved service grants for one goal, such as moving house.</li>
          <li>Aggregate statuses, receipts, deadlines and next steps with the citizen's permission.</li>
          <li>Make civic work understandable and accessible independently of any one commercial agent.</li>
        </ul>
        <p>
          That would require a separate product case and a strong privacy argument. It should not be the only way to
          use government services, and it must not be able to authorise itself or override a department's decision.
          It may turn out that portable standards and existing agents are sufficient, in which case Orchestrate need not exist.
        </p>
      </div>

      <h2>An example: moving house</h2>
      <p>
        A person tells their chosen assistant, &ldquo;Help me move house.&rdquo; The assistant identifies address updates
        at HMRC, DVLA and the council. Delegate could show a single approval journey but would record <strong>three separate
        service-scoped grants</strong>. No implicit permission to access every department is created.
      </p>

      <h2>What we are building next</h2>
      <p>
        Make Delegate generic: departments publish capability definitions, people grant richer boundaries,
        and a second mock department integrates without changing Delegate code. Later we can explore grouped consent.
        We are <strong>not</strong> adding agent planning, task scheduling or orchestration to Delegate.
      </p>
      <p><Link href="/how-it-works">See how the current prototype works</Link> or <Link href="/why">read the product case</Link>.</p>
    </div>
  );
}

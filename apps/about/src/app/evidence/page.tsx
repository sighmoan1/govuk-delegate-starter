import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Evidence and experiments",
  description: "How the independent GOV.UK Delegate prototype will test whether authorised agent access helps government handle automated demand.",
};

const EXPERIMENTS = [
  {
    id: "E1",
    title: "Will agents choose the authorised route?",
    comparison: "Agent route and handoff variants across tool-capable assistants",
    status: "Exploratory observations only",
  },
  {
    id: "E2",
    title: "What does Delegate add beyond a good API?",
    comparison: "Same service API + service-local delegated access versus API + Delegate",
    status: "Bounded technical comparison recorded; citizen-effort and benefit study still outstanding",
  },
  {
    id: "E3",
    title: "Can we preserve genuine demand under load?",
    comparison: "100 distinct citizens versus retries, sub-agents and excessive polling",
    status: "Existing synthetic swarm demonstration; comparative study not yet run",
  },
  {
    id: "E4",
    title: "Do authorisation and transaction controls hold?",
    comparison: "Valid, revoked, expired, duplicate and adversarial transactions",
    status: "Technical test source exists; no run evidence in the register",
  },
  {
    id: "E5",
    title: "Do citizens understand and control access?",
    comparison: "Standing mandates versus repeated transaction approvals",
    status: "Not yet run",
  },
  {
    id: "E6",
    title: "Can another service adopt Delegate easily?",
    comparison: "Independent department with no department-specific Delegate code",
    status: "Not yet run",
  },
  {
    id: "E7",
    title: "What happens when systems go down?",
    comparison: "Authorisation outages, retries after commit and queue failures",
    status: "Not yet run as a comparative study",
  },
];

const repoDoc = (name: string) =>
  `https://github.com/sighmoan1/govuk-delegate-starter/blob/main/docs/${name}`;

export default function EvidencePage() {
  return (
    <div>
      <div className="two-thirds">
        <h1>What would prove GOV.UK Delegate works?</h1>
        <p className="lead">
          Our proposition is that easier, verifiable, revocable agent access could help government handle growing automated demand
          without blocking legitimate citizens. We have built a prototype; we have not yet demonstrated the full economic or
          real-world benefit.
        </p>
        <p>
          The crucial test is whether <strong>Delegate adds anything beyond a well-designed agent API</strong>.
          Good APIs, retries, idempotency and service-side queues can already reduce unnecessary demand.
          Delegate needs to justify its extra consent step through better authority, accountability and citizen control.
        </p>
      </div>

      <h2>Count citizen outcomes, not HTTP requests</h2>
      <div className="table-container">
        <table>
          <thead><tr><th scope="col">Kind of demand</th><th scope="col">Desired service response</th></tr></thead>
          <tbody>
            <tr><th scope="row">100 citizens, 100 legitimate submissions</th><td>Preserve all 100 opportunities to submit and get a correct decision.</td></tr>
            <tr><th scope="row">One citizen, 100 technical retries</th><td>Record one intended operation and return the same result safely.</td></tr>
            <tr><th scope="row">Repeated status checks</th><td>Reduce wasted work without treating a status request as a new claim.</td></tr>
            <tr><th scope="row">An agent without authority</th><td>Prevent unauthorised action and explain the proper route.</td></tr>
            <tr><th scope="row">A possibly ineligible claim</th><td>Apply service rules without conflating ineligibility with agent fraud.</td></tr>
          </tbody>
        </table>
      </div>

      <h2>The core comparison</h2>
      <div className="table-container">
        <table>
          <thead><tr><th scope="col">Condition</th><th scope="col">What it isolates</th></tr></thead>
          <tbody>
            <tr><th scope="row">A. Human-facing service</th><td>Current journey effort and outcomes for context.</td></tr>
            <tr><th scope="row">B. Good agent API with service-local delegated access</th><td>Benefit from a suitable interface, while keeping legitimate authorisation and service safeguards.</td></tr>
            <tr><th scope="row">C. The same API + GOV.UK Delegate</th><td>Incremental benefit (and costs) of reusable, independent citizen-controlled authority.</td></tr>
          </tbody>
        </table>
      </div>
      <p>
        The important result is <strong>C compared with B</strong>, using the same synthetic workload, API quality,
        business rules, infrastructure and agent tools. Otherwise we might mistakenly credit Delegate for improvements
        caused by the API.
      </p>

      <h2>Experiments to run</h2>
      <div className="table-container">
        <table>
          <thead><tr><th scope="col">Experiment</th><th scope="col">Comparison</th><th scope="col">Evidence today</th></tr></thead>
          <tbody>
            {EXPERIMENTS.map((experiment) => (
              <tr key={experiment.id}>
                <th scope="row">{experiment.id}: {experiment.title}</th>
                <td>{experiment.comparison}</td>
                <td>{experiment.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>What we've actually observed so far</h2>
      <div className="two-thirds">
        <p>
          <strong>Exploratory:</strong> <Link href="/which-route">Individual agent route-choice observations</Link> reveal
          practical problems with discovering and completing a consent handoff. These are a small, non-random set of
          runs, <strong>not</strong> an adoption-rate estimate.
        </p>
        <p>
          <strong>Technical:</strong> <Link href="/swarm">the swarm scenario</Link> and repository tests exercise
          synthetic principal-level business limits and transaction integrity. They do not themselves establish
          whether Delegate reduces overall cost or prevents real-world fraud.
        </p>
        <p>
          <strong>Controlled technical comparison:</strong> a fixed synthetic workload completed through both service-local
          authorisation and Delegate, with no tested unauthorised or duplicate business effects. It found no incremental
          outcome advantage for Delegate in that workload. <a href={repoDoc("evidence/RUN-20261009-E2-01.md")}>Read the pinned run and raw evidence</a>.
          Citizen consent effort and financial costs were unmeasured.
        </p>
        <p>
          <strong>Still unproven:</strong> how much easier real agents find Delegate, what it adds beyond a good API,
          whether citizens understand their grants, and what a real public service would save or spend.
        </p>
      </div>

      <h2>How we will report results</h2>
      <div className="two-thirds">
        <p>
          Every measured result needs a dated run, code version, workload, denominators, observed business effects,
          comparison arm, failures and limitations. We will publish negative and inconclusive results too.
        </p>
        <p>
          Our intended headline measure, when real costs are available, is <strong>fully loaded cost per correctly
          handled distinct legitimate citizen intent</strong>, alongside non-negotiable safeguards for access, integrity
          and citizen control. Until then we must label timing and infrastructure measures as proxies, not savings.
        </p>
      </div>

      <h2>Read and reuse the evidence</h2>
      <ul>
        <li><a href={repoDoc("VALIDATION.md")}>Experimental protocol, hypotheses and falsification criteria</a></li>
        <li><a href={repoDoc("EVIDENCE.md")}>Evidence register and reproducible run template</a></li>
        <li><a href={repoDoc("DEMO_GUIDE.md")}>Seven-minute demo script and claims we can defend</a></li>
      </ul>
      <p className="small">
        This is an <strong>independent synthetic prototype</strong>. Planned experiments are not completed trials.
        We have not measured UK-wide adoption, cost savings, fraud reduction or service-user outcomes.
      </p>
    </div>
  );
}

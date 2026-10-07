import type { Metadata } from "next";
import Link from "next/link";
import { config } from "@/lib/config";
import { requireSignedIn } from "@/lib/guard";
import { claimsFor } from "@/lib/taxpayers";
import { fmt } from "@/lib/format";

export const metadata: Metadata = { title: "Your tax" };

export default async function YourTax({ searchParams }: { searchParams: Promise<{ claimed?: string }> }) {
  const { claimed } = await searchParams;
  const taxpayer = await requireSignedIn("/your-tax", "view_tax_code");
  const claims = await claimsFor(taxpayer.id);
  const hasWfh = claims.some((c) => c.kind === "job_expenses");

  return (
    <div>
      {claimed && (
        <div className="confirmation-panel">
          <h1>Claim received</h1>
          <p>Reference {claimed}</p>
        </div>
      )}
      <span className="caption">Tax year {taxpayer.taxYear}</span>
      <h1>Your tax</h1>
      <dl className="summary-list">
        <div><dt>Name</dt><dd>{taxpayer.name}</dd><dd /></div>
        <div><dt>Tax code</dt><dd><strong>{taxpayer.taxCode}</strong></dd><dd /></div>
        <div><dt>Employer</dt><dd>{taxpayer.employer}</dd><dd /></div>
      </dl>

      {!hasWfh ? (
        <>
          <h2>Working from home</h2>
          <p>You have not claimed tax relief for working from home this year. If your employer required you to work from home, you can claim now. It takes about a minute.</p>
          <Link className="button" href="/claim">Claim tax relief for working from home</Link>
          <div className="assistant-panel">
            <h2>Or let an assistant do it for you</h2>
            <p>
              An agent you have given permission to through <a href={`${config.delegateUrl}`}>GOV.UK Delegate</a> can make this claim for you
              using its own access to this service. It will show here as submitted on your behalf, and you can remove its access at any time.
            </p>
            <p><a href={config.agentUrl}>Try Example AI</a></p>
          </div>
        </>
      ) : (
        <p>Your working-from-home claim for this year has been received.</p>
      )}

      <h2>Claims and changes</h2>
      {claims.length === 0 ? <p>None yet.</p> : (
        <ul className="claims">
          {claims.map((c) => (
            <li key={c.id}>
              <strong>{c.summary}</strong>
              {c.newTaxCode && <span>New tax code {c.newTaxCode}. </span>}
              <span>Reference {c.reference}, {fmt(c.createdAt)}.</span>{" "}
              {c.submittedBy === "AGENT"
                ? <span className="by">Submitted by {c.agentName} on your behalf</span>
                : <span className="by by--self">Submitted by you</span>}
            </li>
          ))}
        </ul>
      )}
      <p className="small">
        Agents acting for you appear by name. You can see and remove their access at <a href={`${config.delegateUrl}/account/delegates`}>Who can act for you</a>.
      </p>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { config } from "@/lib/config";
import { requireSignedIn } from "@/lib/guard";
import { claimsFor } from "@/lib/taxpayers";
import { withPrincipalCapacity } from "@/lib/capacity";
import { fmt } from "@/lib/format";

export const metadata: Metadata = { title: "Your tax" };

export default async function YourTax({ searchParams }: { searchParams: Promise<{ claimed?: string; refused?: string }> }) {
  const { claimed, refused } = await searchParams;
  const taxpayer = await requireSignedIn("/your-tax", "view_tax_code");
  // Looking up the tax code counts against the person, however it's done.
  const view = await withPrincipalCapacity(taxpayer, "view_tax_code", {}, async () => null);
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
      {refused && (
        <div className="error-summary" role="alert">
          <h2>Your claim was not sent</h2>
          <p>{refused === "DUPLICATE_SUBMISSION" ? "This claim has already been made." : refused === "NEW_EVIDENCE_REQUIRED" ? "You’ve already claimed for this tax year. You can only claim again with new evidence." : "You have too many open claims and changes. Wait for one to be decided."}</p>
        </div>
      )}
      <span className="caption">{taxpayer.name}</span>
      <h1>Your tax</h1>
      <p>Tax year {taxpayer.taxYear}</p>
      <dl className="summary-list">
        <div><dt>Tax code</dt><dd>{view.ok ? <strong>{taxpayer.taxCode}</strong> : "Your tax code has been looked up too many times in the last hour. Try again later."}</dd><dd /></div>
        <div><dt>Employer</dt><dd>{taxpayer.employer}</dd><dd /></div>
      </dl>

      {!hasWfh ? (
        <>
          <h2>Working from home</h2>
          <p>You have not claimed tax relief for working from home this year. If your employer required you to work from home, you can claim now. It takes about a minute.</p>
          <Link className="button" href="/claim">Claim tax relief for working from home</Link>
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
      <h2>Someone acting for you</h2>
      <p>Claims made by someone you have given permission to show who made them. <a href={`${config.delegateUrl}/account/delegates`}>Manage who can act for you</a> in your GOV.UK account.</p>
    </div>
  );
}

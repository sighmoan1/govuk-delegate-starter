import type { Metadata } from "next";
import Link from "next/link";
import { config } from "@/lib/config";
import { requireViewer, viewerCan } from "@/lib/guard";
import { claimsFor, reopenDisputedAnswers } from "@/lib/taxpayers";
import { prisma } from "@/lib/db";
import { withPrincipalCapacity } from "@/lib/capacity";
import { fmt } from "@/lib/format";

export const metadata: Metadata = { title: "Your tax" };

export default async function YourTax({ searchParams }: { searchParams: Promise<{ claimed?: string; refused?: string; replied?: string; replyError?: string }> }) {
  const { claimed, refused, replied, replyError } = await searchParams;
  // This page mixes several kinds of data. An agent gets in with any one
  // permission, and sees only the sections its permissions cover.
  const viewer = await requireViewer("/your-tax", ["view_tax_code", "view_claim_status", "respond_to_query", "claim_job_expenses"]);
  const { taxpayer } = viewer;
  const canTaxCode = viewerCan(viewer, "view_tax_code");
  const canClaims = viewerCan(viewer, "view_claim_status");
  const canQueries = viewerCan(viewer, "respond_to_query");
  const canClaim = viewerCan(viewer, "claim_job_expenses");
  // Looking up the tax code counts against the person, however it's done.
  const view = canTaxCode ? await withPrincipalCapacity(taxpayer, "view_tax_code", {}, async () => null) : null;
  const claims = canClaims ? await claimsFor(taxpayer.id) : [];
  const { checked: disputesChecked } = canQueries ? await reopenDisputedAnswers(taxpayer.id) : { checked: true };
  const openQueries = canQueries ? await prisma.claimQuery.findMany({ where: { status: "OPEN", claim: { taxpayerId: taxpayer.id } }, include: { claim: true }, orderBy: { askedAt: "asc" } }) : [];
  const hasWfh = claims.some((c) => c.kind === "job_expenses");

  return (
    <div>
      {claimed && (
        <div className="confirmation-panel">
          <h1>Claim received</h1>
          <p>Reference {claimed}</p>
        </div>
      )}
      {replied && (
        <div className="confirmation-panel">
          <h1>Reply sent</h1>
          <p>HMRC will review your answer.</p>
        </div>
      )}
      {replyError && (
        <div className="error-summary" role="alert">
          <h2>Your reply was not sent</h2>
          <p>{replyError === "DELEGATE_UNAVAILABLE" ? "GOV.UK could not record the answer, so HMRC has not accepted it. The question is still open. Try again shortly." : ["PERMISSION_MISSING", "NO_AUTHORISATION", "AUTHORISATION_REVOKED", "AUTHORISATION_EXPIRED"].includes(replyError) ? "You haven’t been given permission to answer HMRC’s questions." : "Write your answer in the box. It can be up to 1000 characters."}</p>
        </div>
      )}
      {refused && (
        <div className="error-summary" role="alert">
          <h2>Your claim was not sent</h2>
          <p>{refused === "DUPLICATE_SUBMISSION" ? "This claim has already been made." : refused === "NEW_EVIDENCE_REQUIRED" ? "You’ve already claimed for this tax year. You can only claim again with new evidence." : refused === "PERMISSION_MISSING" ? "You haven’t been given permission to do that." : refused === "CAPACITY_EXCEEDED" ? "You have too many open claims and changes. Wait for one to be decided." : "This couldn’t be done."}</p>
        </div>
      )}
      {!disputesChecked && (
        <div className="inset-text" role="status">
          We could not check GOV.UK just now for answers you have told us you did not agree to. Answers sent for you are shown as received until we can check. Refresh in a few minutes.
        </div>
      )}
      {canTaxCode && <span className="caption">{taxpayer.name}</span>}
      <h1>Your tax</h1>
      <p>Tax year {taxpayer.taxYear}</p>
      {canTaxCode && view && (
        <dl className="summary-list">
          <div><dt>Tax code</dt><dd>{view.ok ? <strong>{taxpayer.taxCode}</strong> : "Your tax code has been looked up too many times in the last hour. Try again later."}</dd><dd /></div>
          <div><dt>Employer</dt><dd>{taxpayer.employer}</dd><dd /></div>
        </dl>
      )}

      {!canClaim ? null : !hasWfh ? (
        <>
          <h2>Working from home</h2>
          <p>You have not claimed tax relief for working from home this year. If your employer required you to work from home, you can claim now. It takes about a minute.</p>
          <Link className="button" href="/claim">Claim tax relief for working from home</Link>
        </>
      ) : (
        <p>Your working-from-home claim for this year has been received.</p>
      )}

      {openQueries.length > 0 && (
        <>
          <h2>HMRC has asked you a question</h2>
          {openQueries.map((q) => (
            <form key={q.id} action="/query/reply" method="post" className="form-group">
              <input type="hidden" name="query_id" value={q.id} />
              <p><strong>About claim {q.claim.reference}:</strong> {q.question}</p>
              {q.answerWithdrawn && <p className="inset-text">You told GOV.UK you did not agree to the answer sent for you before, so HMRC has not accepted it. Please answer again.</p>}
              <label className="label" htmlFor={`answer-${q.id}`}>Your answer</label>
              <textarea className="textarea" id={`answer-${q.id}`} name="answer" rows={4} maxLength={1000} required />
              <button className="button" type="submit">Send answer</button>
            </form>
          ))}
        </>
      )}

      {canClaims && <h2>Claims and changes</h2>}
      {!canClaims ? null : claims.length === 0 ? <p>None yet.</p> : (
        <ul className="claims">
          {claims.map((c) => (
            <li key={c.id}>
              <strong>{c.summary}</strong>
              {c.newTaxCode && <span>New tax code {c.newTaxCode}. </span>}
              <span>Reference {c.reference}, {fmt(c.createdAt)}.</span>{" "}
              <span>{openQueries.some((q) => q.claimId === c.id) ? "Waiting for your reply. " : c.kind === "job_expenses" ? "Being reviewed. " : ""}</span>
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

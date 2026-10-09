import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { requireViewer } from "@/lib/guard";
import { TAX_YEAR, WFH_NEW_CODE, WFH_RELIEF } from "@/lib/taxpayers";

export const metadata: Metadata = { title: "Check your answers" };

export default async function Check({ searchParams }: { searchParams: Promise<{ required?: string }> }) {
  const { required } = await searchParams;
  const { taxpayer } = await requireViewer("/claim/check", "claim_job_expenses");
  if (required !== "yes") redirect("/claim?error=required");
  return (
    <div className="two-thirds">
      <a className="back-link" href="/claim">Back</a>
      <h1>Check your answers</h1>
      <dl className="summary-list">
        <div><dt>Claim</dt><dd>Tax relief for working from home</dd><dd /></div>
        <div><dt>Tax year</dt><dd>{TAX_YEAR}</dd><dd /></div>
        <div><dt>Employer required you to work from home</dt><dd>Yes</dd><dd><a href="/claim">Change</a></dd></div>
        <div><dt>Relief</dt><dd>{WFH_RELIEF}</dd><dd /></div>
        <div><dt>Your tax code will change</dt><dd>{taxpayer.taxCode} to {WFH_NEW_CODE}</dd><dd /></div>
      </dl>
      <form action="/claim/submit" method="post">
        {/* Stable for this page: pressing Submit twice, or resending the form, is one submission. */}
        <input type="hidden" name="submission_id" value={randomUUID()} />
        <button className="button" type="submit">Submit claim</button>
      </form>
    </div>
  );
}

import type { Metadata } from "next";
import { requireViewer } from "@/lib/guard";
import { TAX_YEAR, WFH_RELIEF } from "@/lib/taxpayers";

export const metadata: Metadata = { title: "Claim tax relief for working from home" };

export default async function ClaimForm({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  await requireViewer("/claim", "claim_job_expenses");
  return (
    <div className="two-thirds">
      <a className="back-link" href="/your-tax">Back</a>
      {error && (
        <div className="error-summary" role="alert" aria-labelledby="err-h">
          <h2 id="err-h">There is a problem</h2>
          <ul><li><a href="#required">Confirm that your employer required you to work from home</a></li></ul>
        </div>
      )}
      <form action="/claim/check" method="get">
        <div className={`form-group${error ? " form-group--error" : ""}`}>
          <fieldset aria-describedby="claim-hint">
            <legend><h1>Claim tax relief for working from home</h1></legend>
            <p id="claim-hint">For the tax year {TAX_YEAR}. The relief is {WFH_RELIEF}, given by changing your tax code.</p>
            {error && <p className="error-message"><span className="visually-hidden">Error: </span>Confirm the statement below to continue</p>}
            <div className="choice-item">
              <input id="required" type="checkbox" name="required" value="yes" />
              <label htmlFor="required">
                My employer required me to work from home, and I was not paid these costs by my employer.
              </label>
            </div>
          </fieldset>
        </div>
        <button className="button" type="submit">Continue</button>
      </form>
    </div>
  );
}

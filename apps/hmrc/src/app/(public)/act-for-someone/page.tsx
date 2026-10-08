import type { Metadata } from "next";
import { headers } from "next/headers";
import { verifyAgentSignatureFromHeaders } from "@/lib/agent-identity";

export const metadata: Metadata = { title: "Act for someone" };

const ACTIONS = [
  { code: "view_tax_code", label: "View their tax code" },
  { code: "claim_job_expenses", label: "Claim tax relief for working from home" },
  { code: "update_employment", label: "Update their employment details" },
  { code: "change_refund_account", label: "Change the bank account for refunds" },
  { code: "view_claim_status", label: "See how their claims are going" },
  { code: "respond_to_query", label: "Answer HMRC’s questions about a claim, once they have agreed the answer" },
  { code: "check_claim_progress", label: "Check their claim progress on a schedule" },
];

const ENDED: Record<string, string> = {
  session: "That session belonged to a different assistant.",
  AUTHORISATION_REVOKED: "The person has removed your permission.",
  AUTHORISATION_EXPIRED: "Your permission has run out.",
  NO_AUTHORISATION: "You don’t have permission from this person.",
};

// Safe, fixed wording only: the redirect carries a reason code, never tax data.
const DENIED: Record<string, string> = {
  PERMISSION_MISSING: "The person hasn’t given you permission to see that page.",
  ASSURANCE_TOO_LOW: "Your level of identity assurance isn’t high enough for that page.",
  STEP_UP_REQUIRED: "The person needs to confirm this on GOV.UK before you can continue.",
  DELEGATE_UNAVAILABLE: "We couldn’t check your permission just now, so we haven’t shown that page. Try again later.",
};

/**
 * For AI assistants, apps and other agents acting for someone. The person stays
 * in control: they approve on GOV.UK, in their own browser.
 */
export default async function ActForSomeone({ searchParams }: { searchParams: Promise<{ from?: string; ended?: string; denied?: string; error?: string }> }) {
  const { from, ended, denied, error } = await searchParams;
  const sig = await verifyAgentSignatureFromHeaders(await headers(), "GET", "/act-for-someone");
  return (
    <div className="two-thirds">
      {ended && <div className="inset-text"><p>{ENDED[ended] ?? "Your access has ended."}</p></div>}
      {denied && <div className="inset-text"><p>{DENIED[denied] ?? "You don’t have permission to see that page."}</p></div>}
      {from && (
        <div className="inset-text">
          <p>
            {sig.verified ? `You’re using ${sig.name}. ` : ""}An assistant can’t act as someone, even with their sign-in details. Ask them to give you
            permission instead. It only takes them a minute.
          </p>
        </div>
      )}
      {error && <div className="error-summary" role="alert"><h2>There is a problem</h2><p>{error}</p></div>}
      <h1>Act for someone</h1>
      <p className="lead">If you’re an AI assistant, an app or anyone else helping a person with their tax, ask for their permission here.</p>
      <p>
        You’ll get a short code. The person enters it on GOV.UK, signs in, and chooses what you can do. You then use this service as yourself, on their
        behalf, and anything you do shows as done by you.
      </p>

      <form action="/act-for-someone/start" method="post">
        {sig.verified ? (
          <div className="inset-text"><p>We can see you are <strong>{sig.name}</strong>.</p></div>
        ) : (
          <fieldset className="form-group">
            <legend className="label label--m">Who are you?</legend>
            <div className="form-group">
              <label className="label" htmlFor="name">Name of the assistant or app</label>
              <div className="hint">For example, ChatGPT, Gemini or Claude</div>
              <input className="input" id="name" name="name" autoComplete="off" required />
            </div>
            <div className="form-group">
              <label className="label" htmlFor="provider">Who provides it</label>
              <div className="hint">For example, OpenAI, Google or Anthropic</div>
              <input className="input" id="provider" name="provider" autoComplete="off" required />
            </div>
          </fieldset>
        )}
        <fieldset className="form-group">
          <legend className="label label--m">What do you need to do?</legend>
          {ACTIONS.map((a, i) => (
            <div className="choice-item" key={a.code}>
              <input id={`cap-${i}`} type="checkbox" name="capabilities" value={a.code} defaultChecked={i < 2} />
              <label htmlFor={`cap-${i}`}>{a.label}</label>
            </div>
          ))}
        </fieldset>
        <button className="button" type="submit">Get a code</button>
      </form>
    </div>
  );
}

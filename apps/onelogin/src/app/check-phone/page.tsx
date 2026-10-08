import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PHONE_ENDING, readFlow, strict } from "@/lib/flow";
import { AgentNotice } from "../agent-notice";
import { submitCode } from "../actions";

export const metadata: Metadata = { title: "Check your phone" };

export default async function CheckPhone({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const flow = await readFlow();
  if (!strict() || !flow?.passwordOk) redirect("/expired");
  const { error } = await searchParams;
  return (
    <div className="ol-narrow">
      <AgentNotice path="/check-phone" />
      <Link className="ol-back" href="/enter-password">Back</Link>
      {error && (
        <div className="ol-error-summary" role="alert" aria-labelledby="err-h">
          <h2 id="err-h">There is a problem</h2>
          <ul><li><a href="#code">The code you entered is not correct, or has run out</a></li></ul>
        </div>
      )}
      <form action={submitCode} noValidate>
        <h1>Check your phone</h1>
        <p>We have sent a text message with a 6 digit security code to your phone number ending with {PHONE_ENDING}.</p>
        <p className="ol-hint">The code will expire in 15 minutes.</p>
        <div className={`ol-form-group${error ? " ol-form-group--error" : ""}`}>
          <label className="ol-label" htmlFor="code">Enter the 6 digit security code</label>
          {error && <p className="ol-error-message"><span className="visually-hidden">Error: </span>The code you entered is not correct, or has run out</p>}
          <input className="ol-input" id="code" name="code" inputMode="numeric" autoComplete="one-time-code" spellCheck={false} />
        </div>
        <button className="ol-button" type="submit">Continue</button>
      </form>
      <p><a href="#">Problems with the code?</a></p>
    </div>
  );
}

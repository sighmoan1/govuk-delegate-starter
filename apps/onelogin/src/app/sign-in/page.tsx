import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { demoEmail, readFlow } from "@/lib/flow";
import { submitEmail } from "../actions";

export const metadata: Metadata = { title: "Enter your email address" };

export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string; value?: string }> }) {
  const flow = await readFlow();
  if (!flow) redirect("/expired");
  const { error, value } = await searchParams;
  return (
    <div className="ol-narrow">
      {error && (
        <div className="ol-error-summary" role="alert" aria-labelledby="err-h">
          <h2 id="err-h">There is a problem</h2>
          <ul><li><a href="#email">Enter an email address in the correct format, like name@example.com</a></li></ul>
        </div>
      )}
      <form action={submitEmail} noValidate>
        <h1>Enter your email address to sign in to your GOV.UK One Login</h1>
        <div className={`ol-form-group${error ? " ol-form-group--error" : ""}`}>
          <label className="ol-label" htmlFor="email">Email address</label>
          {error && <p className="ol-error-message"><span className="visually-hidden">Error: </span>Enter an email address in the correct format, like name@example.com</p>}
          <input className="ol-input" id="email" name="email" type="email" autoComplete="email" spellCheck={false} defaultValue={value ?? demoEmail()} />
        </div>
        <button className="ol-button" type="submit">Continue</button>
      </form>
      <p><a href="#">Problems signing in</a></p>
    </div>
  );
}

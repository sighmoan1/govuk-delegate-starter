import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { readFlow, strict } from "@/lib/flow";
import { AgentNotice } from "../agent-notice";
import { submitPassword } from "../actions";

export const metadata: Metadata = { title: "Enter your password" };

export default async function EnterPassword({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const flow = await readFlow();
  if (!flow?.email) redirect("/expired");
  const { error } = await searchParams;
  return (
    <div className="ol-narrow">
      <AgentNotice path="/enter-password" />
      <Link className="ol-back" href="/sign-in">Back</Link>
      {error && (
        <div className="ol-error-summary" role="alert" aria-labelledby="err-h">
          <h2 id="err-h">There is a problem</h2>
          <ul><li><a href="#password">{error === "wrong" ? "Enter the correct password" : "Enter your password"}</a></li></ul>
        </div>
      )}
      <form action={submitPassword} noValidate>
        <h1>Enter your password</h1>
        <p className="ol-hint">Signing in as <strong>{flow.email}</strong></p>
        <div className={`ol-form-group${error ? " ol-form-group--error" : ""}`}>
          <label className="ol-label" htmlFor="password">Password</label>
          {error && <p className="ol-error-message"><span className="visually-hidden">Error: </span>{error === "wrong" ? "Enter the correct password" : "Enter your password"}</p>}
          <input className="ol-input" id="password" name="password" type="password" autoComplete="current-password" defaultValue={strict() ? undefined : "password"} />
        </div>
        <button className="ol-button" type="submit">Continue</button>
      </form>
      <p><a href="#">I’ve forgotten my password</a></p>
    </div>
  );
}

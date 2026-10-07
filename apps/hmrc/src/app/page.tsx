import Link from "next/link";
import { config } from "@/lib/config";
import { currentTaxpayer } from "@/lib/session";

export default async function Start({ searchParams }: { searchParams: Promise<{ signin?: string }> }) {
  const { signin } = await searchParams;
  const taxpayer = await currentTaxpayer();
  return (
    <div className="two-thirds">
      {signin === "failed" && (
        <div className="error-summary" role="alert">
          <h2>Sign in did not complete</h2>
          <p>We could not confirm your sign-in with the GOV.UK One Login simulator. Try again.</p>
        </div>
      )}
      <h1>Claim tax relief for working from home</h1>
      <p className="lead">If your employer required you to work from home, you may be able to claim tax relief on the extra costs.</p>
      <p>Use this service to:</p>
      <ul className="service-list">
        <li>see your current tax code</li>
        <li>claim tax relief for working from home for this tax year</li>
        <li>see claims and changes made for you, and by whom</li>
      </ul>
      <p>You sign in with GOV.UK One Login. In this prototype that is the <strong>One Login simulator</strong>: a form of test details appears; press <strong>Continue</strong> to sign in as Sam.</p>
      <a className="button" href={taxpayer ? "/your-tax" : "/auth/login?returnTo=/your-tax"} role="button" draggable="false">
        {taxpayer ? "Your tax" : "Start now"}
      </a>
      <h2>Using an assistant?</h2>
      <p>
        An AI assistant or other agent can use this service for you, through its own API, once you have given it permission through{" "}
        <a href={config.delegateUrl}>GOV.UK Delegate</a>. It acts with its own identity, never your sign-in, and you can remove its access at
        any time. Agents that have not been given permission, and traffic that will not identify itself, get a slower route with tighter
        limits. See the <Link href="/ops">operations view</Link>.
      </p>
    </div>
  );
}

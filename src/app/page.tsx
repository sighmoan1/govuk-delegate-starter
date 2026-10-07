import Link from "next/link";
import { currentPrincipal } from "@/lib/session";

export default async function Start({ searchParams }: { searchParams: Promise<{ signin?: string }> }) {
  const principal = await currentPrincipal();
  const { signin } = await searchParams;
  return (
    <div className="two-thirds">
      {signin === "failed" && (
        <div className="error-summary" role="alert">
          <h2>Sign in did not complete</h2>
          <p>We could not confirm your sign-in with the GOV.UK One Login simulator. Try again.</p>
        </div>
      )}
      <h1>GOV.UK Delegate</h1>
      <p className="lead">Give someone or something permission to act for you across government.</p>
      <p>Use this service to:</p>
      <ul className="service-list">
        <li>see who can act for you</li>
        <li>approve or reject requests to act for you</li>
        <li>choose what a delegate is allowed to do</li>
        <li>remove access</li>
        <li>see recent activity</li>
      </ul>
      <a className="button" href={principal ? "/delegates" : "/auth/login?returnTo=/delegates"} role="button" draggable="false">Start now</a>
      <p>
        <Link href="/about">About this prototype</Link>
      </p>
      <div className="inset-text">
        <p className="small">
          Signing in uses the GOV.UK One Login <strong>simulator</strong>. Press <strong>Continue</strong> on its form to sign in as the demo person.
          Want to see the agent’s side first? Open the <Link href="/agent">Demo Personal Agent</Link>.
        </p>
      </div>
    </div>
  );
}

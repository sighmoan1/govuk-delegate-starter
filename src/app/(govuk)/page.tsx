import Link from "next/link";

export default async function Start({ searchParams }: { searchParams: Promise<{ signin?: string }> }) {
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
      <p className="lead">Let an AI agent, a person or an organisation act for you with government, and stay in control of what they can do.</p>
      <p>
        Delegate would work like GOV.UK One Login: not a website you visit, but something you meet inside other services. When an agent asks to act
        for you, GOV.UK asks you what to allow. Later, you can see and remove that permission in your account.
      </p>
      <p>In this demo you are <strong>Sam</strong>. You ask an AI assistant to claim tax relief for working from home. It needs your permission to deal with HMRC for you.</p>
      <a className="button" href="/example-ai" role="button" draggable="false">Try the demo</a>
      <ul className="service-list">
        <li><Link href="/about">Why we are exploring this</Link></li>
        <li><Link href="/account/delegates">Who can act for you</Link> (your GOV.UK account)</li>
        <li><Link href="/operator/activity">What HMRC’s service team sees</Link></li>
      </ul>
    </div>
  );
}

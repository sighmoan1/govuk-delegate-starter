import { currentTaxpayer } from "@/lib/session";

export default async function Start({ searchParams }: { searchParams: Promise<{ signin?: string }> }) {
  const { signin } = await searchParams;
  const taxpayer = await currentTaxpayer();
  return (
    <div className="two-thirds">
      {signin === "failed" && (
        <div className="error-summary" role="alert">
          <h2>There is a problem</h2>
          <p>We could not sign you in. Try again.</p>
        </div>
      )}
      <h1>Claim tax relief for your job expenses</h1>
      <p>You may be able to claim tax relief if you use your own money for things you must buy for your job, or if your employer requires you to work from home.</p>
      <p>Use this service to:</p>
      <ul>
        <li>check your tax code</li>
        <li>claim tax relief for working from home</li>
        <li>see claims made by you or by someone acting for you</li>
      </ul>
      <p>Your tax code will change so you pay less tax. You’ll usually get the relief within a few weeks.</p>
      <a className="button" href={taxpayer ? "/your-tax" : "/auth/login?returnTo=/your-tax"} role="button" draggable="false">Start now</a>

      <h2>Before you start</h2>
      <p>You’ll need to sign in with GOV.UK One Login.</p>

      <h2>If someone else deals with your tax</h2>
      <p>An accountant, a family member or an app can act for you if you give them permission through your GOV.UK account. They use their own sign-in, not yours.</p>
    </div>
  );
}

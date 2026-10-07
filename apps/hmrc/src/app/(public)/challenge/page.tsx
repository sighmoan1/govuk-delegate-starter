import type { Metadata } from "next";
import { config } from "@/lib/config";

export const metadata: Metadata = { title: "Before you continue" };

// What traffic outside the trusted route meets after a few anonymous requests.
// A stand-in: in a real service this is where proportionate abuse controls go.
export default async function Challenge({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const { returnTo = "/your-tax" } = await searchParams;
  const safe = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/your-tax";
  return (
    <div className="two-thirds">
      <h1>Before you continue</h1>
      <p>We’ve had a lot of requests from your network. Confirm you’re a person to continue.</p>
      <form action="/challenge/pass" method="post">
        <input type="hidden" name="returnTo" value={safe} />
        <div className="form-group">
          <div className="choice-item">
            <input id="person" type="checkbox" name="person" value="yes" required />
            <label htmlFor="person">I am a person using this service for myself</label>
          </div>
        </div>
        <button className="button hold-button" type="submit">Continue</button>
      </form>
      <h2>If you’re acting for someone else</h2>
      <p>Apps and agents must use the HMRC API with the person’s permission. <a href={`${config.delegateUrl}`}>Find out how to get permission through GOV.UK</a>.</p>
    </div>
  );
}

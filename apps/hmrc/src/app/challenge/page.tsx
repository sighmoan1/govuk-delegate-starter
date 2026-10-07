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
      <p>This page has had a lot of requests from where you are, and none of them were signed in. We need to check that a person is here.</p>
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
      <p className="challenge-note">
        In this prototype the check is a checkbox. A real service would use its own, proportionate controls here. The point is that signed-in
        people and agents with permission never see this page.
      </p>
      <h2>Are you an agent acting for someone?</h2>
      <p>
        Register with <a href={config.delegateUrl}>GOV.UK Delegate</a> and ask the person for permission. You then get a structured API with
        no challenges and a much higher limit.
      </p>
    </div>
  );
}

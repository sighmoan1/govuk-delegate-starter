import type { Metadata } from "next";
import { urls } from "@/lib/config";
import { StartFrom } from "../start-from";

export const metadata: Metadata = { title: "Sam asks her assistant to claim tax relief" };

export default async function UseAnAgent({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const { reset } = await searchParams;
  return (
    <div>
      <span className="caption">Scenario 1</span>
      <h1>Sam asks her assistant to claim tax relief</h1>
      <div className="two-thirds">
        <p className="lead">Sam works from home. She asks her AI assistant to claim the tax relief she’s entitled to. The assistant has never dealt with HMRC for her before.</p>
        <p>
          <strong>What it shows:</strong> the assistant asks Sam for permission through GOV.UK, uses its own identity rather than Sam’s
          sign-in, and can only do what she allowed. HMRC checks with GOV.UK Delegate before every request.
        </p>
      </div>

      <StartFrom back="/use-an-agent" recommended="clean" done={reset} />

      <h2>Steps</h2>
      <ol className="steps">
        <li>
          <h3>Ask the assistant</h3>
          <span className="where">Example AI · <a href={urls.agent}>open</a></span>
          <p>Choose <strong>Claim my working-from-home tax relief</strong>. It can’t reach HMRC yet, so it asks Sam to connect HMRC on GOV.UK.</p>
        </li>
        <li>
          <h3>Give permission on GOV.UK</h3>
          <span className="where">GOV.UK One Login, then GOV.UK Delegate</span>
          <p>Choose <strong>Continue to GOV.UK</strong>. Sign in: Sam’s details are filled in, so press <strong>Continue</strong> twice.</p>
          <p>GOV.UK shows what the assistant is asking to do. Sam can untick anything. Choose <strong>Continue</strong>, then <strong>Allow</strong>. She goes straight back to the assistant.</p>
        </li>
        <li>
          <h3>The assistant does the job</h3>
          <span className="where">Example AI</span>
          <p>It reads Sam’s tax code and submits the claim. Her code changes from 1257L to 1288L.</p>
        </li>
        <li>
          <h3>Ask for something Sam didn’t allow</h3>
          <span className="where">Example AI</span>
          <p>Choose <strong>Change my refund bank account to my new bank</strong>. HMRC refuses, because GOV.UK Delegate says Sam never allowed it. The assistant tells her, and offers to ask.</p>
        </li>
        <li>
          <h3>See it from HMRC’s side</h3>
          <span className="where">HMRC · <a href={`${urls.hmrc}/your-tax`}>Your tax</a></span>
          <p>Sam’s claim is there, marked <strong>Submitted by Example AI on your behalf</strong>.</p>
        </li>
      </ol>
    </div>
  );
}

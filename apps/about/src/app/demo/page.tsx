import type { Metadata } from "next";
import Link from "next/link";
import { urls } from "@/lib/config";

export const metadata: Metadata = { title: "Run the demo" };

export default function Demo() {
  return (
    <div>
      <h1>Run the demo</h1>
      <p className="lead">About three minutes. You are Sam throughout. Open each link in the same tab and follow the step.</p>
      <p className="tip">
        Whenever you are asked to sign in, you’ll see the GOV.UK One Login simulator: a form full of test details. Leave it as it is and press
        <strong> Continue</strong>. That signs you in as Sam.
      </p>

      <ol className="steps">
        <li>
          <h3>Sam checks her tax with HMRC</h3>
          <span className="where">HMRC · <a href={urls.hmrc}>{urls.hmrc}</a></span>
          <p>Press <strong>Start now</strong> and sign in. Sam’s tax code is 1257L and she hasn’t claimed tax relief for working from home. She could claim herself. Instead she asks her assistant.</p>
        </li>
        <li>
          <h3>Sam asks her assistant</h3>
          <span className="where">Example AI · <a href={urls.agent}>{urls.agent}</a></span>
          <p>Choose <strong>Claim my working-from-home tax relief</strong>. The assistant has no access to HMRC, so it asks Sam to connect HMRC on GOV.UK.</p>
        </li>
        <li>
          <h3>Sam gives permission on GOV.UK</h3>
          <span className="where">GOV.UK Delegate</span>
          <p>Press <strong>Continue to GOV.UK</strong>. Sam sees what the assistant is asking for, can untick anything, and presses <strong>Allow</strong>. She goes straight back to the assistant.</p>
        </li>
        <li>
          <h3>The assistant does the job</h3>
          <span className="where">Example AI</span>
          <p>It reads Sam’s tax code and submits the claim: new tax code 1288L. Behind the scenes HMRC asked GOV.UK Delegate before each request.</p>
          <p>Now choose <strong>Change my refund bank account</strong>. Sam never allowed that, so HMRC refuses, and the assistant tells her.</p>
        </li>
        <li>
          <h3>Flood HMRC</h3>
          <span className="where">Demo console · <Link href="/console">/console</Link></span>
          <p>Send 40 requests as an unregistered bot, then 40 as Example AI. The bot gets nothing; the assistant gets everything. Open <a href={`${urls.hmrc}/ops?live=1`}>HMRC’s operations view</a> to watch from HMRC’s side.</p>
        </li>
        <li>
          <h3>Sam changes her mind</h3>
          <span className="where">GOV.UK · <a href={`${urls.delegate}/account/delegates`}>Who can act for you</a></span>
          <p>Remove the assistant’s access. Back in Example AI, choose <strong>What’s my tax code?</strong>: it no longer has access.</p>
        </li>
        <li>
          <h3>Sam checks HMRC again</h3>
          <span className="where">HMRC · <a href={`${urls.hmrc}/your-tax`}>Your tax</a></span>
          <p>The claim is there, marked <strong>Submitted by Example AI on your behalf</strong>.</p>
        </li>
      </ol>

      <h2>Start again</h2>
      <p>To put everything back as it was, run <code>npm run db:reset</code> in the repository.</p>
    </div>
  );
}

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Precedents" };

export default function Precedents() {
  return (
    <div className="two-thirds">
      <h1>Existing government patterns</h1>
      <p className="lead">None of this is new machinery. GOV.UK Delegate generalises things government already does.</p>

      <h2>HMRC agent authorisation</h2>
      <p>HMRC already lets registered tax agents ask to act for clients. The client approves independently, and HMRC records a relationship that can later be checked or removed.</p>
      <p>This is the main pattern the prototype copies.</p>

      <h2>GOV.UK One Login</h2>
      <p>One Login already gives services a common way to sign people in and, where needed, prove their identity.</p>
      <p>Delegate explores the next question: <strong>who is allowed to act for that person?</strong></p>

      <h2>Government guidance on delegated authority</h2>
      <p>Existing guidance says evidence of authority should identify the person and their representative, describe the permissions granted and record when they were given. It can include conditions, such as time or value limits.</p>

      <h2>DWP representation and explicit consent</h2>
      <p>DWP already lets claimants give representatives access to information about their claim, and Universal Credit explicit consent can be limited and withdrawn.</p>

      <h2>Use a lasting power of attorney</h2>
      <p>The Office of the Public Guardian already uses One Login in its online LPA service, and gives time-limited access codes that organisations use to check authority.</p>
    </div>
  );
}

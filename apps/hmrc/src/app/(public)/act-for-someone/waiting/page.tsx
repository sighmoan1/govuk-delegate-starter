import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { config } from "@/lib/config";
import { currentPending } from "@/lib/agent-session";

export const metadata: Metadata = { title: "Waiting for the person to decide" };

export default async function Waiting() {
  const pending = await currentPending();
  if (!pending) redirect("/act-for-someone");
  return (
    <div className="two-thirds">
      {/* Checks with GOV.UK every few seconds and carries on by itself once the person decides. */}
      <meta httpEquiv="refresh" content="4;url=/act-for-someone/check" />
      <span className="caption">{pending.agentName}</span>
      <h1>Ask the person to approve you</h1>
      <p>Ask them to go to GOV.UK on their own phone or computer:</p>
      <p className="code-panel"><strong>{config.delegateUrl}/approve</strong></p>
      <p>and enter this code:</p>
      <p className="code-panel code-panel--big" aria-label={`Code ${pending.userCode.split("").join(" ")}`}>{pending.userCode}</p>
      <p>They’ll sign in, see what you’ve asked to do, and choose. This page will update when they have decided.</p>
      <p className="small">The code works for 15 minutes. Don’t enter it yourself: only the person can approve.</p>
      <p><a href="/act-for-someone/check">Check now</a> · <a href="/act-for-someone/stop">Cancel</a></p>
    </div>
  );
}

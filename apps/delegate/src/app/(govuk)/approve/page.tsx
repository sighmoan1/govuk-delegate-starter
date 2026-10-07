import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentPrincipal } from "@/lib/session";
import { CAPABILITY_COPY } from "@/lib/capabilities";
import { decideStepUp } from "./actions";

export const metadata: Metadata = { title: "Approve an action" };

export default async function Approve({ searchParams }: { searchParams: Promise<{ code?: string; error?: string; done?: string }> }) {
  const { code = "", error, done } = await searchParams;
  const principal = await currentPrincipal();
  if (!principal) redirect(`/auth/login?returnTo=${encodeURIComponent(`/approve?code=${code}`)}`);

  if (done) {
    return (
      <div className="two-thirds">
        <div className="confirmation-panel">
          <h1>{done === "approved" ? "Approved" : "Declined"}</h1>
          <p>{done === "approved" ? "The assistant can now do this once." : "The assistant can’t do this."}</p>
        </div>
        <p><Link href="/account/delegates">See who can act for you</Link></p>
      </div>
    );
  }

  // A code for an agent asking to act for this person: show the consent screen.
  const agentRequest = code ? await prisma.authorisationRequest.findUnique({ where: { userCode: code.toUpperCase().trim() } }) : null;
  if (agentRequest && agentRequest.status === "PENDING" && (!agentRequest.principalId || agentRequest.principalId === principal.id)) {
    redirect(`/consent/${agentRequest.id}`);
  }

  const stepUp = code
    ? await prisma.stepUp.findUnique({ where: { userCode: code.toUpperCase().trim() }, include: { mandate: { include: { delegate: true, service: true } } } })
    : null;
  const mine = stepUp && stepUp.mandate.principalId === principal.id && stepUp.status === "PENDING";

  if (!mine) {
    return (
      <div className="two-thirds">
        {(error || code) && (
          <div className="error-summary" role="alert"><h2>There is a problem</h2><ul><li><a href="#code">Check the code and try again</a></li></ul></div>
        )}
        <form method="get">
          <div className="form-group">
            <h1><label htmlFor="code">Enter the code you were given</label></h1>
            <div className="hint">It looks like KQ7M-42XD.</div>
            <input className="input input--postcode" id="code" name="code" defaultValue={code} autoComplete="off" spellCheck={false} />
          </div>
          <button className="button" type="submit">Continue</button>
        </form>
      </div>
    );
  }

  const label = CAPABILITY_COPY[stepUp.capability]?.label ?? stepUp.capability;
  return (
    <div className="two-thirds">
      <span className="caption">{stepUp.mandate.service.name}</span>
      <h1>{stepUp.mandate.delegate.name} wants to {label.charAt(0).toLowerCase() + label.slice(1)}</h1>
      <p>This is a sensitive action, so it needs your approval each time. Only approve it if you asked {stepUp.mandate.delegate.name} to do this.</p>
      <div className="button-row">
        <form action={decideStepUp}>
          <input type="hidden" name="code" value={stepUp.userCode} />
          <input type="hidden" name="decision" value="approve" />
          <button className="button" type="submit">Approve once</button>
        </form>
        <form action={decideStepUp}>
          <input type="hidden" name="code" value={stepUp.userCode} />
          <input type="hidden" name="decision" value="decline" />
          <button className="button button--secondary" type="submit">Decline</button>
        </form>
      </div>
    </div>
  );
}

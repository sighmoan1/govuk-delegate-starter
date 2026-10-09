import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentPrincipal } from "@/lib/session";
import { fmt } from "@/lib/format";
import { viewOf, type DisplayRow } from "@/lib/step-ups";
import { decideStepUp } from "./actions";

export const metadata: Metadata = { title: "Approve a change" };

const PROBLEM: Record<string, string> = {
  expired: "This request has run out. Ask the assistant to try again if you still want it.",
  "mandate-ended": "You have removed this assistant’s access, or it has run out, so this can’t be approved.",
  "not-pending": "This request has already been decided.",
};

export default async function Approve({ searchParams }: { searchParams: Promise<{ code?: string; error?: string; done?: string }> }) {
  const { code = "", error, done } = await searchParams;
  const principal = await currentPrincipal();
  if (!principal) redirect(`/auth/login?returnTo=${encodeURIComponent(`/approve?code=${code}`)}`);
  const normalised = code.toUpperCase().trim();

  // A code for an agent asking to act for this person: show the consent screen.
  const agentRequest = normalised ? await prisma.authorisationRequest.findUnique({ where: { userCode: normalised } }) : null;
  if (agentRequest && agentRequest.status === "PENDING" && (!agentRequest.principalId || agentRequest.principalId === principal.id)) {
    redirect(`/consent/${agentRequest.id}`);
  }

  // A code for one proposed change. It only opens for the person it was issued to.
  const row = normalised
    ? await prisma.stepUp.findUnique({ where: { userCode: normalised }, include: { mandate: { include: { delegate: true, service: true, permissions: { include: { capability: true } } } } } })
    : null;
  const stepUp = row && row.mandate.principalId === principal.id ? row : null;

  if (done && stepUp) {
    const approved = done === "approved";
    return (
      <div className="two-thirds">
        <div className="confirmation-panel">
          <h1>{approved ? "You approved this change" : "You declined this change"}</h1>
          <p>
            {approved
              ? `${stepUp.mandate.delegate.name} can make exactly this change, once, until ${fmt(stepUp.expiresAt)}. It is used up only when ${stepUp.mandate.service.name} makes the change.`
              : `${stepUp.mandate.delegate.name} can’t make this change.`}
          </p>
        </div>
        <p><Link href="/account/delegates">See who can act for you</Link></p>
      </div>
    );
  }

  const view = stepUp ? viewOf(stepUp, new Date()) : null;
  if (!stepUp || view !== "PENDING") {
    const problem = error && PROBLEM[error] ? PROBLEM[error] : stepUp && view === "EXPIRED" ? PROBLEM.expired : stepUp && view && view !== "PENDING" ? PROBLEM["not-pending"] : null;
    return (
      <div className="two-thirds">
        {(error || code) && (
          <div className="error-summary" role="alert"><h2>There is a problem</h2><ul><li><a href="#code">{problem ?? "Check the code and try again"}</a></li></ul></div>
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

  const agent = stepUp.mandate.delegate.name;
  const service = stepUp.mandate.service.name;
  const details = stepUp.display as unknown as DisplayRow[];
  return (
    <div className="two-thirds">
      <span className="caption">{service}</span>
      <h1>{agent} wants to make this change</h1>
      <p><strong>{stepUp.mandate.permissions.find(p => p.capability.code === stepUp.capability)?.capability.name ?? stepUp.capability}</strong></p>
      <dl className="summary-list">
        {details.map((d) => (
          <div key={d.label}><dt>{d.label}</dt><dd>{d.value}</dd></div>
        ))}
      </dl>
      <div className="inset-text">
        <p>Approving covers <strong>only this change, with exactly these details</strong>. If {agent} tries different details, it has to ask you again.</p>
        <p>It can be used once, and only until {fmt(stepUp.expiresAt)}. It is used up only when {service} actually makes the change. If {service} turns the change down, the approval is not used up.</p>
        <p>Only approve it if you asked {agent} to do this. This is a demonstration: the details are made up and nothing is checked with a real bank or address register.</p>
      </div>
      <div className="button-row">
        <form action={decideStepUp}>
          <input type="hidden" name="code" value={stepUp.userCode} />
          <input type="hidden" name="decision" value="approve" />
          <button className="button" type="submit">Approve this change</button>
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

import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { CAPABILITY_COPY, REASON_COPY, capabilityLabel } from "@/lib/capabilities";
import { loadRequest } from "@/lib/requests";
import { actAction, actUntrustedAction, cancelRequestAction, requestAuthorityAction } from "./actions";

export const metadata: Metadata = { title: "Demo Personal Agent" };
export const dynamic = "force-dynamic";

type Result = { capability: string; identified: boolean; status: number; lane: string | null; limit: string | null; body: unknown };

export default async function AgentPage({ searchParams }: { searchParams: Promise<{ r?: string; error?: string }> }) {
  const { r, error } = await searchParams;
  const delegate = await prisma.delegate.findUnique({ where: { clientId: config.demoAgentClientId } });
  if (!delegate) return <p>The demo agent has not been seeded. Run <code>npm run db:seed</code>.</p>;

  const service = await prisma.service.findUniqueOrThrow({ where: { slug: "dwp-benefits" }, include: { capabilities: { orderBy: { sortOrder: "asc" } } } });
  const latestId = (await prisma.authorisationRequest.findFirst({ where: { delegateId: delegate.id }, orderBy: { createdAt: "desc" }, select: { id: true } }))?.id;
  const latest = latestId ? await loadRequest(latestId) : null;
  // What the agent knows: the principal of its most recent approved request.
  const approved = await prisma.authorisationRequest.findFirst({
    where: { delegateId: delegate.id, status: "APPROVED" },
    orderBy: { respondedAt: "desc" },
  });

  let result: Result | null = null;
  if (r) { try { result = JSON.parse(Buffer.from(r, "base64url").toString()); } catch { result = null; } }
  const body = result?.body as { decision?: string; reason?: string } | string | undefined;
  const allowed = result?.status === 200;
  const reason = typeof body === "object" ? body?.reason : undefined;

  return (
    <div>
      <h1>Demo Personal Agent</h1>
      <p className="lead">An external software agent, simulated.</p>
      <p>
        This page represents an external software agent. It signs in as itself and attempts government transactions on behalf of the selected principal.
        It never sees the principal’s One Login session.
      </p>
      <p className="small">Delegate: {delegate.name} ({delegate.type.replace("_", " ").toLowerCase()}) · Provider: {delegate.provider} · Client ID: <span className="mono">{delegate.clientId}</span></p>

      {error && <div className="error-summary" role="alert"><h2>The request did not go through</h2><p>Delegate answered with status {error}.</p></div>}

      <h2>1. Ask for authority</h2>
      {(!latest || latest.status !== "PENDING") && (
        <form action={requestAuthorityAction}>
          <div className="form-group">
            <label className="label" htmlFor="hint">Who do you want to act for?</label>
            <div id="hint-hint" className="hint">A hint only, such as an email address. The person approves it after signing in.</div>
            <input className="input" id="hint" name="hint" defaultValue="test@example.com" aria-describedby="hint-hint" />
          </div>
          <fieldset className="form-group">
            <legend className="label">What are you asking to do with {service.name}?</legend>
            {service.capabilities.map((c) => (
              <div className="choice-item" key={c.id}>
                <input id={`cap-${c.code}`} type="checkbox" name="cap" value={c.code} defaultChecked={["check_claim_status", "submit_evidence", "report_change"].includes(c.code)} />
                <label htmlFor={`cap-${c.code}`}>{c.name}{c.riskLevel === "HIGH" && <> — <span className="sensitive">sensitive action</span></>}</label>
              </div>
            ))}
          </fieldset>
          <button className="button" type="submit">Request authority</button>
        </form>
      )}
      {latest && (
        <div className={`delegate-card ${latest.status === "PENDING" ? "delegate-card--pending" : latest.status === "APPROVED" ? "" : "delegate-card--ended"}`}>
          <p>Latest request: <span className={`status status--${latest.status.toLowerCase()}`}>{latest.status === "PENDING" ? "Waiting for the person" : latest.status.charAt(0) + latest.status.slice(1).toLowerCase()}</span></p>
          <p>Asked for: {latest.permissions.map((p) => capabilityLabel(p.capability.code).toLowerCase()).join(", ")}.</p>
          {latest.status === "PENDING" && (
            <>
              <p>Send the person this link. They approve it themselves after signing in:</p>
              <p><Link href={`/requests/${latest.id}`} target="_blank" rel="noopener">Open the approval page as the principal<span className="visually-hidden"> (opens in a new tab)</span></Link></p>
              <form action={cancelRequestAction}>
                <input type="hidden" name="id" value={latest.id} />
                <button className="button button--secondary" type="submit">Cancel request</button>
              </form>
              <p className="small">Once they have decided, <Link href="/agent">refresh this page</Link>.</p>
            </>
          )}
        </div>
      )}

      <h2>2. Try a transaction</h2>
      {!approved ? (
        <p>You have no approved request yet, so the agent has nobody to act for. You can still try the actions below without identifying yourself to see the untrusted lane.</p>
      ) : (
        <p>The agent will act for principal <span className="mono">{approved.principalId}</span>. It does not know whether that authority has since been removed. The service checks every time.</p>
      )}

      {result && (
        <section aria-live="polite" className={`result-panel${allowed ? "" : " result-panel--deny"}`}>
          <h2>{allowed ? "Authorised — trusted lane" : "Denied"}</h2>
          <p><strong>{capabilityLabel(result.capability)}</strong> · HTTP {result.status}{result.lane ? ` · lane ${result.lane}` : ""}{result.limit ? ` · limit ${result.limit}/min` : ""}</p>
          <p>
            {allowed ? REASON_COPY.VALID_AUTHORISATION
              : reason ? `${REASON_COPY[reason] ?? reason} (${reason})`
              : "The service did not accept this request because the caller did not identify itself. No machine-readable detail is given outside the trusted lane."}
          </p>
          <pre>{typeof result.body === "string" ? result.body : JSON.stringify(result.body, null, 2)}</pre>
        </section>
      )}

      <div className="agent-actions">
        {Object.entries(CAPABILITY_COPY).map(([code, c]) => (
          <form action={actAction} key={code}>
            <input type="hidden" name="capability" value={code} />
            <input type="hidden" name="principal_id" value={approved?.principalId ?? ""} />
            <button className="button button--secondary" type="submit">{c.verb}</button>
          </form>
        ))}
      </div>

      <h3>Without identifying itself</h3>
      <p>The same action, as unidentified traffic. It gets no structured response and a much lower rate limit.</p>
      <form action={actUntrustedAction} className="agent-actions">
        <input type="hidden" name="capability" value="check_claim_status" />
        <button className="button button--secondary" type="submit">Check claim status without identifying</button>
      </form>

      <p><Link href="/activity">See every attempt on the activity page</Link></p>
    </div>
  );
}

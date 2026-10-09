import { validateConstraints } from "@/lib/constraints";
import type { CatalogueCapability } from "@/lib/catalogues";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentPrincipal } from "@/lib/session";
import { expireDueAuthorisations } from "@/lib/authority";
import { capabilityLabel } from "@/lib/capabilities";
import { fmt, fmtTime } from "@/lib/format";
import { ConsentHistory } from "@/components/consent-history";
import { loadConsentHistory, type ApprovalEvidence } from "@/lib/consent-evidence";
import { outcomeLabel, reasonLabel } from "@/lib/outcomes";
import { narrowRestrictionsAction, narrowAction, disputeAction } from "../../../actions";

export const metadata: Metadata = { title: "Access details" };

export default async function AuthorisationDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ removed?: string; narrowed?: string; disputed?: string; restrictions?:string }>;
}) {
  const { id } = await params;
  const { removed, narrowed, disputed, restrictions: restrictionStatus } = await searchParams;
  const principal = await currentPrincipal();
  if (!principal) redirect(`/auth/login?returnTo=${encodeURIComponent(`/account/delegates/${id}`)}`);
  await expireDueAuthorisations();
  const a = await prisma.authorisation.findUnique({
    where: { id },
    include: { delegate: true, service: true, permissions: { include: { capability: true } } },
  });
  if (!a || a.principalId !== principal.id) notFound();
  const consentHistory = await loadConsentHistory(a.id, principal.id);
  const approval = consentHistory.find(e => e.kind === "APPROVED");
  const original = approval ? approval.payload as unknown as ApprovalEvidence : null;
  const latestCatalogue = await prisma.serviceCatalogue.findFirst({ where: { serviceId: a.serviceId }, orderBy: { version: "desc" }, select: { digest: true } });
  const catalogueChanged = Boolean(original && latestCatalogue && original.catalogue.digest !== latestCatalogue.digest);
  const all = await prisma.capability.findMany({ where: { serviceId: a.serviceId, catalogueId: original?.catalogue.id ?? a.permissions[0]?.capability.catalogueId ?? null }, orderBy: { sortOrder: "asc" } });
  const capabilityName = (code: string) => a.permissions.find(p => p.capability.code === code)?.capability.name ?? all.find(c => c.code === code)?.name ?? capabilityLabel(code);
  const allowed = all.filter((c) => a.permissions.some((p) => p.capabilityId === c.id));
  const notAllowed = all.filter((c) => !allowed.includes(c));
  const events = await prisma.activityEvent.findMany({
    where: { principalId: principal.id, delegateId: a.delegateId },
    orderBy: { timestamp: "desc" },
    take: 10,
  });
  const outcomes = await prisma.transactionOutcome.findMany({ where: { mandateId: a.id, principalId: principal.id }, orderBy: { occurredAt: "desc" }, take: 20 });
  const latestByCheck = new Map<string, (typeof outcomes)[number]>();
  for (const o of [...outcomes].reverse()) latestByCheck.set(o.checkId, o);
  const receipts = await prisma.receipt.findMany({ where: { mandateId: a.id }, orderBy: { createdAt: "desc" } });
  await prisma.receipt.updateMany({ where: { mandateId: a.id, seenAt: null }, data: { seenAt: new Date() } });
  const restrictions=validateConstraints(a.constraints,a.permissions.map(p=>p.capability.metadata as unknown as CatalogueCapability).filter(Boolean));
  const label = a.status === "ACTIVE" ? "Active" : a.status === "REVOKED" ? "Removed" : "Expired";

  return (
    <div>
      <Link className="back-link" href="/account/delegates">Back</Link>
      {removed && (
        <div className="confirmation-panel"><h1>Access removed</h1><p>{a.delegate.name} can no longer act for you with {a.service.name}. {a.service.name} will refuse anything it tries from now on.</p></div>
      )}
      {narrowed && <div className="inset-text"><p>That permission has been taken away. The rest still applies.</p></div>}
      {disputed && <div className="inset-text"><p>Marked as not agreed. {a.delegate.name} can no longer do that, and {a.service.name} will discover the dispute when it next checks the receipt and then treat the answer as not given. This is not an immediate notification.</p></div>}
      {!removed && <h1>{a.delegate.name}</h1>}
      <dl className="summary-list">
        <div><dt>Status</dt><dd><span className={`status status--${a.status.toLowerCase()}`}>{label}</span></dd><dd /></div>
        <div><dt>Delegate</dt><dd>{a.delegate.name} ({a.delegate.type.replace("_", " ").toLowerCase()}), provided by {a.delegate.provider}</dd><dd /></div>
        <div><dt>Government service</dt><dd>{a.service.name}</dd><dd /></div>
        <div><dt>{a.status === "ACTIVE" ? "Allowed to" : "Previously selected permissions"}</dt><dd>{allowed.map((c) => (
          <span key={c.id}>
            {c.name}
            {a.status === "ACTIVE" && (
              <form action={narrowAction} style={{ display: "inline" }}>
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="capability" value={c.code} />
                {" "}<button className="link-button" type="submit">Stop this<span className="visually-hidden"> ({c.name})</span></button>
              </form>
            )}
            <br />
          </span>
        ))}</dd><dd /></div>
        <div><dt>Not allowed to</dt><dd>{notAllowed.map((c) => <span key={c.id}>{c.name}<br /></span>)}</dd><dd /></div>
        <div><dt>Given</dt><dd>{fmt(a.validFrom)}</dd><dd /></div>
        <div><dt>{a.status === "REVOKED" ? "Removed" : "Valid until"}</dt><dd>{fmt(a.status === "REVOKED" && a.revokedAt ? a.revokedAt : a.validUntil)}</dd><dd /></div>
      </dl>
      {a.status === "ACTIVE" && <Link className="button" href={`/account/delegates/${a.id}/remove`}>Remove access</Link>}

      {Object.keys(restrictions).length>0 && <section><h2>Current restrictions</h2>{restrictionStatus && <p role="status">{restrictionStatus==="saved"?"Restrictions saved. All sub-agents are limited by them immediately.":"Keep at least one value for each restriction. Restrictions can only be narrowed."}</p>}<form action={narrowRestrictionsAction}><input type="hidden" name="id" value={id} />{Object.entries(restrictions).flatMap(([cap,fields])=>Object.entries(fields).map(([key,values])=><fieldset key={`${cap}:${key}`}><legend>{capabilityName(cap)}: {(a.permissions.find(p=>p.capability.code===cap)?.capability.metadata as unknown as CatalogueCapability)?.supported_constraints?.[key]?.label ?? key}</legend>{values.map(value=><div className="choice-item" key={value}><input type="checkbox" id={`current-${cap}-${key}-${value}`} name={`restriction:${cap}:${key}`} value={value} defaultChecked disabled={a.status!=="ACTIVE"} /><label htmlFor={`current-${cap}-${key}-${value}`}>{value}</label></div>)}</fieldset>))}{a.status==="ACTIVE" && <button className="button button--secondary" type="submit">Save narrower restrictions</button>}</form></section>}
      <ConsentHistory original={original} changed={catalogueChanged} history={consentHistory.map(event => {
        const payload = event.payload as { capability?: string; reason?: string };
        return { id: event.id, kind: event.kind, occurredAt: event.occurredAt, capability: payload.capability, reason: payload.reason };
      })} />

      {receipts.length > 0 && (
        <section aria-labelledby="said-h">
          <h2 id="said-h">What it said you agreed to</h2>
          <p>{a.service.name} recorded these in your name. If you did not agree to one, say so and {a.delegate.name} loses that permission.</p>
          {receipts.map((r) => (
            <div key={r.id} className={`delegate-card${r.status === "DISPUTED" ? " delegate-card--ended" : ""}`}>
              <p><strong>{capabilityName(r.capability)}</strong>, {fmtTime(r.createdAt)}</p>
              <blockquote>{r.text}</blockquote>
              <p>{r.agentConfirmed ? `${a.delegate.name} told ${a.service.name} that you agreed.` : <strong>{a.delegate.name} sent this and did not say whether you had agreed.</strong>}</p>
              {r.status === "DISPUTED" ? <p><strong>You said you did not agree to this.</strong></p> : (
                <form action={disputeAction}>
                  <input type="hidden" name="receipt" value={r.id} />
                  <button className="button button--secondary" type="submit">I didn’t agree to this</button>
                </form>
              )}
            </div>
          ))}
        </section>
      )}

      <h2>What it has done for you</h2>
      <p>What {a.service.name} told us happened. This is separate from what {a.delegate.name} said you agreed to.</p>
      {outcomes.length === 0 ? <p>{a.service.name} has not reported anything done yet.</p> : (
        <div className="table-container">
          <table>
            <thead><tr><th scope="col">Time</th><th scope="col">Action</th><th scope="col">What happened</th><th scope="col">Reference</th></tr></thead>
            <tbody>
              {outcomes.map((o) => (
                <tr key={o.id}>
                  <td>{fmtTime(o.occurredAt)}</td>
                  <td>{capabilityName(o.capability)}</td>
                  <td><span className={`decision decision--${o.status === "FAILED" ? "deny" : "allow"}`}>{outcomeLabel[o.status]}</span>{reasonLabel(o.reason) && <><br />{reasonLabel(o.reason)}</>}</td>
                  <td className="mono">{o.reference ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>What it asked permission for</h2>
      <p>Each time {a.delegate.name} asked to act with {a.service.name}, including what was refused. Being allowed to act does not mean it was done.</p>
      {events.length === 0 ? <p>No attempts yet.</p> : (
        <div className="table-container">
          <table>
            <thead><tr><th scope="col">Time</th><th scope="col">Action</th><th scope="col">Permission check</th><th scope="col">Result reported</th></tr></thead>
            <tbody>
              {events.map((e) => {
                const o = latestByCheck.get(e.id);
                return (
                  <tr key={e.id}>
                    <td>{fmtTime(e.timestamp)}</td>
                    <td>{e.capability ? capabilityName(e.capability) : "—"}</td>
                    <td><span className={`decision decision--${e.decision.toLowerCase()}`}>{e.decision === "ALLOW" ? "Allowed" : "Refused"}</span>{e.decision === "DENY" && <> <span className="mono">{e.reason}</span></>}</td>
                    <td>{e.decision === "DENY" ? "Nothing done" : o ? outcomeLabel[o.status] : "Not reported yet"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentPrincipal } from "@/lib/session";
import { expireDueAuthorisations } from "@/lib/authority";
import { capabilityLabel } from "@/lib/capabilities";
import { fmt, fmtTime } from "@/lib/format";
import { narrowAction, disputeAction } from "../../../actions";

export const metadata: Metadata = { title: "Access details" };

export default async function AuthorisationDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ removed?: string; narrowed?: string; disputed?: string }>;
}) {
  const { id } = await params;
  const { removed, narrowed, disputed } = await searchParams;
  const principal = await currentPrincipal();
  if (!principal) redirect(`/auth/login?returnTo=${encodeURIComponent(`/account/delegates/${id}`)}`);
  await expireDueAuthorisations();
  const a = await prisma.authorisation.findUnique({
    where: { id },
    include: { delegate: true, service: true, permissions: { include: { capability: true } } },
  });
  if (!a || a.principalId !== principal.id) notFound();
  const all = await prisma.capability.findMany({ where: { serviceId: a.serviceId }, orderBy: { sortOrder: "asc" } });
  const allowed = all.filter((c) => a.permissions.some((p) => p.capabilityId === c.id));
  const notAllowed = all.filter((c) => !allowed.includes(c));
  const events = await prisma.activityEvent.findMany({
    where: { principalId: principal.id, delegateId: a.delegateId },
    orderBy: { timestamp: "desc" },
    take: 10,
  });
  const receipts = await prisma.receipt.findMany({ where: { mandateId: a.id }, orderBy: { createdAt: "desc" } });
  await prisma.receipt.updateMany({ where: { mandateId: a.id, seenAt: null }, data: { seenAt: new Date() } });
  const label = a.status === "ACTIVE" ? "Active" : a.status === "REVOKED" ? "Removed" : "Expired";

  return (
    <div>
      <Link className="back-link" href="/account/delegates">Back</Link>
      {removed && (
        <div className="confirmation-panel"><h1>Access removed</h1><p>{a.delegate.name} can no longer act for you with {a.service.name}. HMRC will refuse anything it tries from now on.</p></div>
      )}
      {narrowed && <div className="inset-text"><p>That permission has been taken away. The rest still applies.</p></div>}
      {disputed && <div className="inset-text"><p>Marked as not agreed. {a.delegate.name} can no longer do that, and {a.service.name} has been told to treat the answer as not given.</p></div>}
      {!removed && <h1>{a.delegate.name}</h1>}
      <dl className="summary-list">
        <div><dt>Status</dt><dd><span className={`status status--${a.status.toLowerCase()}`}>{label}</span></dd><dd /></div>
        <div><dt>Delegate</dt><dd>{a.delegate.name} ({a.delegate.type.replace("_", " ").toLowerCase()}), provided by {a.delegate.provider}</dd><dd /></div>
        <div><dt>Government service</dt><dd>{a.service.name}</dd><dd /></div>
        <div><dt>Allowed to</dt><dd>{allowed.map((c) => (
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

      {receipts.length > 0 && (
        <section aria-labelledby="said-h">
          <h2 id="said-h">What it said you agreed to</h2>
          <p>{a.service.name} recorded these in your name. If you did not agree to one, say so and {a.delegate.name} loses that permission.</p>
          {receipts.map((r) => (
            <div key={r.id} className={`delegate-card${r.status === "DISPUTED" ? " delegate-card--ended" : ""}`}>
              <p><strong>{capabilityLabel(r.capability)}</strong>, {fmtTime(r.createdAt)}</p>
              <blockquote>{r.text}</blockquote>
              <p>{r.agentConfirmed ? `${a.delegate.name} told ${a.service.name} that you agreed.` : `${a.delegate.name} did not say you agreed.`}</p>
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
      <p>Everything it has tried with {a.service.name}, including what was refused.</p>
      {events.length === 0 ? <p>No attempts yet.</p> : (
        <div className="table-container">
          <table>
            <thead><tr><th scope="col">Time</th><th scope="col">Action</th><th scope="col">Decision</th><th scope="col">Reason</th></tr></thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td>{fmtTime(e.timestamp)}</td>
                  <td>{e.capability ? capabilityLabel(e.capability) : "—"}</td>
                  <td><span className={`decision decision--${e.decision.toLowerCase()}`}>{e.decision === "ALLOW" ? "Allowed" : "Denied"}</span></td>
                  <td className="mono">{e.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

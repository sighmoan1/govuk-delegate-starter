import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentPrincipal } from "@/lib/session";
import { expireDueAuthorisations } from "@/lib/authority";
import { capabilityLabel } from "@/lib/capabilities";
import { fmt, fmtTime } from "@/lib/format";

export const metadata: Metadata = { title: "Access details" };

export default async function AuthorisationDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ removed?: string }>;
}) {
  const { id } = await params;
  const { removed } = await searchParams;
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
  const label = a.status === "ACTIVE" ? "Active" : a.status === "REVOKED" ? "Removed" : "Expired";

  return (
    <div>
      <Link className="back-link" href="/account/delegates">Back</Link>
      {removed && (
        <div className="confirmation-panel"><h1>Access removed</h1><p>{a.delegate.name} can no longer act for you with {a.service.name}. HMRC will refuse anything it tries from now on.</p></div>
      )}
      {!removed && <h1>{a.delegate.name}</h1>}
      <dl className="summary-list">
        <div><dt>Status</dt><dd><span className={`status status--${a.status.toLowerCase()}`}>{label}</span></dd><dd /></div>
        <div><dt>Delegate</dt><dd>{a.delegate.name} ({a.delegate.type.replace("_", " ").toLowerCase()}), provided by {a.delegate.provider}</dd><dd /></div>
        <div><dt>Government service</dt><dd>{a.service.name}</dd><dd /></div>
        <div><dt>Allowed to</dt><dd>{allowed.map((c) => <span key={c.id}>{c.name}<br /></span>)}</dd><dd /></div>
        <div><dt>Not allowed to</dt><dd>{notAllowed.map((c) => <span key={c.id}>{c.name}<br /></span>)}</dd><dd /></div>
        <div><dt>Given</dt><dd>{fmt(a.validFrom)}</dd><dd /></div>
        <div><dt>{a.status === "REVOKED" ? "Removed" : "Valid until"}</dt><dd>{fmt(a.status === "REVOKED" && a.revokedAt ? a.revokedAt : a.validUntil)}</dd><dd /></div>
      </dl>
      {a.status === "ACTIVE" && <Link className="button" href={`/account/delegates/${a.id}/remove`}>Remove access</Link>}

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

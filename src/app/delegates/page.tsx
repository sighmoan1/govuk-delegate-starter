import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentPrincipal } from "@/lib/session";
import { expireDueAuthorisations } from "@/lib/authority";
import { capabilityLabel } from "@/lib/capabilities";
import { fmtDate } from "../format";

export const metadata: Metadata = { title: "Your delegates" };

export default async function Delegates({ searchParams }: { searchParams: Promise<{ rejected?: string }> }) {
  const principal = await currentPrincipal();
  if (!principal) redirect("/auth/login?returnTo=/delegates");
  const { rejected } = await searchParams;
  await expireDueAuthorisations();

  const [auths, pending] = await Promise.all([
    prisma.authorisation.findMany({
      where: { principalId: principal.id },
      include: { delegate: true, service: true, permissions: { include: { capability: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.authorisationRequest.findMany({
      where: { status: "PENDING", expiresAt: { gt: new Date() }, OR: [{ principalId: null }, { principalId: principal.id }] },
      include: { delegate: true, service: true, permissions: { include: { capability: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const active = auths.filter((a) => a.status === "ACTIVE");
  const ended = auths.filter((a) => a.status !== "ACTIVE");
  const sorted = (a: (typeof auths)[number]) => a.permissions.map((p) => p.capability).sort((x, y) => x.sortOrder - y.sortOrder);

  return (
    <div>
      <h1>Your delegates</h1>
      {rejected && <div className="inset-text"><p>You rejected the request. Nothing was granted.</p></div>}
      <p>These people, organisations and digital agents currently have permission to act for you.</p>

      {pending.length > 0 && (
        <section aria-labelledby="pending-h">
          <h2 id="pending-h">Requests waiting for you</h2>
          {pending.map((r) => (
            <div key={r.id} className="delegate-card delegate-card--pending">
              <h3>{r.delegate.name}</h3>
              <p>{r.service.name}</p>
              <p>Asking to: {r.permissions.map((p) => capabilityLabel(p.capability.code).toLowerCase()).join(", ")}.</p>
              <p>Status: <span className="status status--pending">Waiting for your decision</span></p>
              <Link className="button" href={`/requests/${r.id}`}>Review request<span className="visually-hidden"> from {r.delegate.name}</span></Link>
            </div>
          ))}
        </section>
      )}

      <section aria-labelledby="active-h">
        <h2 id="active-h">Active authority</h2>
        {active.length === 0 && <p>Nobody can currently act for you.</p>}
        {active.map((a) => (
          <div key={a.id} className="delegate-card">
            <h3>{a.delegate.name}</h3>
            <p>{a.service.name}</p>
            <p>Can:</p>
            <ul className="plain">{sorted(a).map((c) => <li key={c.id}>{capabilityLabel(c.code).toLowerCase()}</li>)}</ul>
            <p>Status: <span className="status status--active">Active</span> until {fmtDate(a.validUntil)}</p>
            <div className="button-row">
              <Link className="button button--secondary" href={`/authorisations/${a.id}`}>View authority<span className="visually-hidden"> for {a.delegate.name}</span></Link>
              <Link className="button button--secondary" href={`/authorisations/${a.id}/revoke`}>Revoke access<span className="visually-hidden"> for {a.delegate.name}</span></Link>
            </div>
          </div>
        ))}
      </section>

      {ended.length > 0 && (
        <section aria-labelledby="ended-h">
          <h2 id="ended-h">Previous authority</h2>
          {ended.map((a) => (
            <div key={a.id} className="delegate-card delegate-card--ended">
              <h3>{a.delegate.name}</h3>
              <p>{a.service.name}</p>
              <p>Status: <span className={`status status--${a.status.toLowerCase()}`}>{a.status === "REVOKED" ? "Removed" : "Expired"}</span></p>
              <p><Link href={`/authorisations/${a.id}`}>View authority<span className="visually-hidden"> for {a.delegate.name}</span></Link></p>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

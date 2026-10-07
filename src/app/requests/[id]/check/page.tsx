import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { loadRequest } from "@/lib/requests";
import { currentPrincipal } from "@/lib/session";
import { prisma } from "@/lib/db";
import { approveAction } from "../../../actions";

export const metadata: Metadata = { title: "Check the authority you are giving" };

export default async function Check({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ c?: string | string[] }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const principal = await currentPrincipal();
  if (!principal) redirect(`/auth/login?returnTo=${encodeURIComponent(`/requests/${id}`)}`);
  const req = await loadRequest(id);
  if (!req || (req.principalId && req.principalId !== principal.id)) notFound();
  if (req.status !== "PENDING") redirect(`/requests/${id}`);

  const picked = ([] as string[]).concat(sp.c ?? []);
  const requested = req.permissions.map((p) => p.capability);
  const allowed = requested.filter((c) => picked.includes(c.code));
  if (allowed.length === 0) redirect(`/requests/${id}?error=NO_PERMISSIONS`);
  const all = await prisma.capability.findMany({ where: { serviceId: req.serviceId }, orderBy: { sortOrder: "asc" } });
  const notAllowed = all.filter((c) => !allowed.some((a) => a.id === c.id));
  const qs = allowed.map((c) => `c=${c.code}`).join("&");

  return (
    <div className="two-thirds">
      <Link className="back-link" href={`/requests/${id}`}>Back</Link>
      <h1>Check the authority you are giving</h1>
      <dl className="summary-list">
        <div><dt>Delegate</dt><dd>{req.delegate.name}<br /><span className="small">{req.delegate.provider}</span></dd><dd /></div>
        <div><dt>Government service</dt><dd>{req.service.name}</dd><dd /></div>
        <div>
          <dt>Allowed to</dt>
          <dd>{allowed.map((c) => <span key={c.id}>{c.name}<br /></span>)}</dd>
          <dd><Link href={`/requests/${id}?${qs}`}>Change<span className="visually-hidden"> what it is allowed to do</span></Link></dd>
        </div>
        <div><dt>Not allowed to</dt><dd>{notAllowed.map((c) => <span key={c.id}>{c.name}<br /></span>)}</dd><dd /></div>
        <div><dt>Lasts for</dt><dd>30 days. You can remove it at any time.</dd><dd /></div>
      </dl>
      <form action={approveAction}>
        <input type="hidden" name="id" value={id} />
        {allowed.map((c) => <input key={c.id} type="hidden" name="c" value={c.code} />)}
        <button className="button" type="submit">Authorise agent</button>
      </form>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { loadRequest } from "@/lib/requests";
import { cookies } from "next/headers";
import { currentPrincipal, SESSION_COOKIE } from "@/lib/session";
import { decisionToken } from "@/lib/consent-csrf";
import { consentPresentation, narrowConsent } from "@/lib/consent-presentation";
import { ConsentTerms, ConsentUnavailable, PermissionDescription } from "@/components/consent-details";

export const metadata: Metadata = { title: "Check what you are allowing" };

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
  const csrf = decisionToken((await cookies()).get(SESSION_COOKIE)?.value ?? "", id);
  if (!principal) redirect(`/auth/login?returnTo=${encodeURIComponent(`/consent/${id}`)}`);
  const req = await loadRequest(id);
  if (!req || (req.principalId && req.principalId !== principal.id)) notFound();
  if (req.status !== "PENDING") redirect(`/consent/${id}`);

  const picked = ([] as string[]).concat(sp.c ?? []);
  let presentation;
  try { presentation = consentPresentation(req); } catch { return <ConsentUnavailable id={id} csrf={csrf} />; }
  let allowed;
  try { allowed = narrowConsent(presentation.capabilities, picked); }
  catch { redirect(`/consent/${id}?error=NO_PERMISSIONS`); }
  const notAllowed = presentation.capabilities.filter(c => !allowed.some(a => a.id === c.id));
  const qs = new URLSearchParams();
  for (const c of allowed) qs.append("c", c.code);

  return (
    <div className="two-thirds">
      <Link className="back-link" href={`/consent/${id}?${qs}`}>Back</Link>
      <h1>Check what you are allowing</h1>
      <ConsentTerms presentation={presentation} />
      <dl className="summary-list">
        <div><dt>Delegate</dt><dd>{req.delegate.name}<br /><span className="small">{req.delegate.provider}</span></dd><dd /></div>
        <div><dt>Government service</dt><dd>{req.service.name}</dd><dd /></div>
        <div>
          <dt>Allowed to</dt>
          <dd>{allowed.map((c) => <span key={c.id}>{c.name}<PermissionDescription capability={c} /><br /></span>)}</dd>
          <dd><Link href={`/consent/${id}?${qs}`}>Change<span className="visually-hidden"> what it is allowed to do</span></Link></dd>
        </div>
        <div><dt>Not allowed to</dt><dd>{notAllowed.map((c) => <span key={c.id}>{c.name}<br /></span>)}</dd><dd /></div>
        <div><dt>Catalogue version</dt><dd>{presentation.catalogue.version}</dd><dd /></div>
        <div><dt>Lasts for</dt><dd>{presentation.authorisation_days} days from approval. You can remove it at any time.</dd><dd /></div>
      </dl>
      <form action={`/consent/${id}/decision`} method="post">
        <input type="hidden" name="decision" value="approve" />
        <input type="hidden" name="csrf" value={csrf} />
                {allowed.map((c) => <input key={c.id} type="hidden" name="c" value={c.code} />)}
        <button className="button" type="submit">Allow</button>
      </form>
    </div>
  );
}

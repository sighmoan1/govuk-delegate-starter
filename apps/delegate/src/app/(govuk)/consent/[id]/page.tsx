import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { loadRequest } from "@/lib/requests";
import { cookies } from "next/headers";
import { currentPrincipal, SESSION_COOKIE } from "@/lib/session";
import { decisionToken } from "@/lib/consent-csrf";
import { prisma } from "@/lib/db";

export const metadata: Metadata = { title: "Request to act for you" };

export default async function RequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; c?: string | string[] }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { error } = sp;
  const kept = sp.c === undefined ? null : ([] as string[]).concat(sp.c);
  const principal = await currentPrincipal();
  const csrf = decisionToken((await cookies()).get(SESSION_COOKIE)?.value ?? "", id);
  if (!principal) redirect(`/auth/login?returnTo=${encodeURIComponent(`/consent/${id}`)}`);
  const req = await loadRequest(id);
  if (!req || (req.principalId && req.principalId !== principal.id)) notFound();

  if (req.status !== "PENDING") {
    return (
      <div className="two-thirds">
        <h1>This request is no longer open</h1>
        <p>{req.delegate.name}’s request to act for you with {req.service.name} is <strong>{req.status.toLowerCase()}</strong>.</p>
        <p><Link href="/account/delegates">See who can act for you</Link></p>
      </div>
    );
  }

  const requested = req.permissions.map((p) => p.capability);
  const all = await prisma.capability.findMany({ where: { serviceId: req.serviceId, catalogueId: req.permissions[0]?.capability.catalogueId ?? null }, orderBy: { sortOrder: "asc" } });
  const notRequested = all.filter((c) => !requested.some((r) => r.id === c.id));
  const hasError = Boolean(error) && error !== "AGENT_CANNOT_APPROVE";

  return (
    <div className="two-thirds">
      {error === "AGENT_CANNOT_APPROVE" ? (
        <div className="error-summary" role="alert" aria-labelledby="err-h">
          <h2 id="err-h">The person needs to do this themselves</h2>
          <p>This browser is being driven by an AI assistant. Only the person can give permission. Ask them to open GOV.UK in their own browser and enter the code.</p>
        </div>
      ) : hasError && (
        <div className="error-summary" role="alert" aria-labelledby="err-h">
          <h2 id="err-h">There is a problem</h2>
          <ul><li><a href="#c-0">Choose at least one thing the delegate can do, or reject the request</a></li></ul>
        </div>
      )}
      <form action={`/consent/${id}/check`} method="get">
        <div className={`form-group${hasError ? " form-group--error" : ""}`}>
          <fieldset aria-describedby="req-hint">
            <legend>
              <span className="caption">{req.service.name}</span>
              <h1>{req.delegate.name} wants to act for you</h1>
            </legend>
            <p id="req-hint">
              {req.delegate.name} is an AI assistant from {req.delegate.provider}. It has asked GOV.UK for permission to act for you with {req.service.name}.
              It will not see your GOV.UK sign-in, and you can remove its access at any time.
            </p>
            <p className="label label--m">Choose what it can do.</p>
            {hasError && <p className="error-message"><span className="visually-hidden">Error: </span>Choose at least one permission</p>}
            {requested.map((c, i) => (
              <div className="choice-item" key={c.id}>
                <input id={`c-${i}`} type="checkbox" name="c" value={c.code} defaultChecked={hasError ? false : kept ? kept.includes(c.code) : true} aria-describedby={`c-${i}-hint`} />
                <label htmlFor={`c-${i}`}>
                  {c.name}
                  {c.riskLevel === "HIGH" && <> — <span className="sensitive">sensitive action</span></>}
                  <span id={`c-${i}-hint`} className="choice-hint">
                    {c.riskLevel === "HIGH" ? "This affects money or where HMRC writes to you. Only allow it if you are sure." : c.riskLevel === "MEDIUM" ? "This changes your tax records." : "This only reads information."}
                  </span>
                </label>
              </div>
            ))}
          </fieldset>
        </div>
        {notRequested.length > 0 && (
          <p className="hint">It has not asked to: {notRequested.map((c) => c.name.toLowerCase()).join(", ")}.</p>
        )}
        <div className="button-row">
          <button className="button" type="submit">Continue</button>
        </div>
      </form>
      <form action={`/consent/${id}/decision`} method="post">
        <input type="hidden" name="decision" value="reject" />
        <input type="hidden" name="csrf" value={csrf} />
        <button className="button button--secondary" type="submit">Reject request</button>
      </form>
    </div>
  );
}

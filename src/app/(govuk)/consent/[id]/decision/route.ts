import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { approveRequest, rejectRequest, loadRequest, returnTo, DomainError } from "@/lib/requests";
import { principalFromRequest } from "@/lib/session";

// The person's decision on the consent screen. A plain form POST answered with a
// 303, so the browser really leaves GOV.UK for the agent's registered return URL,
// as with an OAuth consent screen.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const go = (url: string) => NextResponse.redirect(new URL(url, config.appUrl), 303);

  // Same-origin only: a form on another site must not be able to approve.
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(config.appUrl).origin) {
    return NextResponse.json({ error: "CROSS_ORIGIN" }, { status: 403 });
  }
  const principal = await principalFromRequest(req);
  if (!principal) return go(`/consent-signin?returnTo=${encodeURIComponent(`/consent/${id}`)}`);

  const form = await req.formData();
  const decision = String(form.get("decision"));
  try {
    if (decision === "approve") {
      await approveRequest(id, principal.id, form.getAll("c").map(String));
    } else if (decision === "reject") {
      await rejectRequest(id, principal.id);
    } else {
      return go(`/consent/${id}`);
    }
  } catch (e) {
    if (e instanceof DomainError) return go(`/consent/${id}?error=${e.code}`);
    throw e;
  }
  const r = await loadRequest(id);
  const status = decision === "approve" ? "approved" : "rejected";
  const back = r && returnTo(r, status);
  if (back) return NextResponse.redirect(back, 303);
  return go(decision === "approve" ? `/consent/${id}/confirmation` : "/account/delegates?rejected=1");
}

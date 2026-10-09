// The HTTP side of GET /api/claims/progress: private caching headers, the ETag,
// and 304 Not Modified. It wraps the response of requireDelegatedAuthority
// (delegated-authority.ts), so it only ever sees a request after the caller has
// been identified, admitted by throughput.ts and authorised for one person.
//
//   - Every response, success or refusal, is `Cache-Control: private, no-store`
//     and `Vary`ies on the credentials. Nothing here is meant to be stored by a
//     browser, proxy or CDN. The ETag is application-level validation only:
//     the caller sends it back, HMRC compares it with the version it has just
//     worked out for that same person, and answers 304 or the full status.
//   - A 304 is sent only for a 200 that is the person's own status, and only
//     when their dispute check ran (a status that may be stale is never called
//     "unchanged"). Refusals (401, 403, 429, 503, ...) pass through unchanged,
//     apart from the cache header, so a back-off is never turned into
//     "not modified" and a throttle never hides a change.
//   - A 304 is still a check: it was admitted and counted like any other poll
//     (see pollingGuidance), and says so in the documentation.
import { NextResponse } from "next/server";
import { etagOf, ifNoneMatchHolds } from "./progress-version";

const PRIVATE = "private, no-store";
const VARY = "Authorization, Cookie, X-Principal-Id";

export async function conditionalProgress(req: Request, res: NextResponse): Promise<Response> {
  res.headers.set("cache-control", PRIVATE);
  res.headers.set("vary", VARY);
  if (res.status !== 200) return res;

  const body = (await res.clone().json().catch(() => null)) as { result?: { version?: string; dispute_check?: string; polling?: { suggested_next_poll_seconds?: number } } } | null;
  const result = body?.result;
  if (!result?.version) return res;

  const etag = etagOf(result.version);
  const interval = String(result.polling?.suggested_next_poll_seconds ?? "");
  res.headers.set("etag", etag);
  if (interval) res.headers.set("x-suggested-poll-interval", interval);

  if (result.dispute_check === "OK" && ifNoneMatchHolds(req.headers.get("if-none-match"), result.version)) {
    const headers = new Headers({ etag, "cache-control": PRIVATE, vary: VARY });
    if (interval) headers.set("x-suggested-poll-interval", interval);
    const lane = res.headers.get("x-trusted-lane");
    if (lane) headers.set("x-trusted-lane", lane);
    return new Response(null, { status: 304, headers });
  }
  return res;
}

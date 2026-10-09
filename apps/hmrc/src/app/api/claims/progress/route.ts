import { requireDelegatedAuthority } from "@/lib/delegated-authority";
import { claimProgress } from "@/lib/taxpayers";
import { conditionalProgress } from "@/lib/progress-http";

export const dynamic = "force-dynamic";

const check = requireDelegatedAuthority("check_claim_progress", ({ taxpayer, body }) => claimProgress(taxpayer, body));

// A scheduled check. Pass ?since=<ISO time> to learn whether anything changed, or send the
// last ETag as If-None-Match to get 304 Not Modified when nothing has. Private, never stored by a cache.
export const GET = async (req: Request) => conditionalProgress(req, await check(req));

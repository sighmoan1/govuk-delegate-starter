import { requireDelegatedAuthority } from "@/lib/delegated-authority";
import { claimProgress } from "@/lib/taxpayers";

export const dynamic = "force-dynamic";
// A scheduled check. Pass ?since=<ISO time> to learn whether anything changed.
export const GET = requireDelegatedAuthority("check_claim_progress", ({ taxpayer, body }) => claimProgress(taxpayer, body));

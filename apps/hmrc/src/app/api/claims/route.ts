import { requireDelegatedAuthority } from "@/lib/delegated-authority";
import { claimStatus } from "@/lib/taxpayers";

export const dynamic = "force-dynamic";
export const GET = requireDelegatedAuthority("view_claim_status", ({ taxpayer }) => claimStatus(taxpayer));

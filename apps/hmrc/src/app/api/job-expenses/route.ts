import { requireDelegatedAuthority } from "@/lib/delegated-authority";
import { claimJobExpenses } from "@/lib/taxpayers";

export const dynamic = "force-dynamic";
export const POST = requireDelegatedAuthority("claim_job_expenses", ({ taxpayer, actor }) => claimJobExpenses(taxpayer, actor));

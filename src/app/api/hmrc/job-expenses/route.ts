import { requireDelegatedAuthority, hmrcActions } from "@/lib/hmrc";

export const dynamic = "force-dynamic";
const handler = requireDelegatedAuthority("claim_job_expenses", hmrcActions.claim_job_expenses);
export { handler as POST };

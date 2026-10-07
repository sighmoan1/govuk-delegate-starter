import { requireDelegatedAuthority, dwpActions } from "@/lib/dwp";

export const dynamic = "force-dynamic";
const handler = requireDelegatedAuthority("check_claim_status", dwpActions.check_claim_status);
export { handler as GET };

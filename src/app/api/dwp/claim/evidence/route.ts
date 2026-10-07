import { requireDelegatedAuthority, dwpActions } from "@/lib/dwp";

export const dynamic = "force-dynamic";
const handler = requireDelegatedAuthority("submit_evidence", dwpActions.submit_evidence);
export { handler as POST };

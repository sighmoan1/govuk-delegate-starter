import { requireDelegatedAuthority, dwpActions } from "@/lib/dwp";

export const dynamic = "force-dynamic";
const handler = requireDelegatedAuthority("withdraw_claim", dwpActions.withdraw_claim);
export { handler as POST };

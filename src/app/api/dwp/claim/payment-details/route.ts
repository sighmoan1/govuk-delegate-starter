import { requireDelegatedAuthority, dwpActions } from "@/lib/dwp";

export const dynamic = "force-dynamic";
const handler = requireDelegatedAuthority("change_payment_details", dwpActions.change_payment_details);
export { handler as POST };

import { requireDelegatedAuthority, hmrcActions } from "@/lib/hmrc";

export const dynamic = "force-dynamic";
const handler = requireDelegatedAuthority("change_refund_account", hmrcActions.change_refund_account);
export { handler as POST };

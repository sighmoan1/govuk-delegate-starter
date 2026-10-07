import { requireDelegatedAuthority, hmrcActions } from "@/lib/hmrc";

export const dynamic = "force-dynamic";
const handler = requireDelegatedAuthority("change_address", hmrcActions.change_address);
export { handler as POST };

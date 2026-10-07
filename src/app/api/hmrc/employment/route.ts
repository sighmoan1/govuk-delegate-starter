import { requireDelegatedAuthority, hmrcActions } from "@/lib/hmrc";

export const dynamic = "force-dynamic";
const handler = requireDelegatedAuthority("update_employment", hmrcActions.update_employment);
export { handler as POST };

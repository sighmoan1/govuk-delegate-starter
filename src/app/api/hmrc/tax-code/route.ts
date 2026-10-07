import { requireDelegatedAuthority, hmrcActions } from "@/lib/hmrc";

export const dynamic = "force-dynamic";
const handler = requireDelegatedAuthority("view_tax_code", hmrcActions.view_tax_code);
export { handler as GET };

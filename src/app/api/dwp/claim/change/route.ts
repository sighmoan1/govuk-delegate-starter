import { requireDelegatedAuthority, dwpActions } from "@/lib/dwp";

export const dynamic = "force-dynamic";
const handler = requireDelegatedAuthority("report_change", dwpActions.report_change);
export { handler as POST };

import { requireDelegatedAuthority } from "@/lib/delegated-authority";
import { changeRefundAccount } from "@/lib/taxpayers";

export const dynamic = "force-dynamic";
export const POST = requireDelegatedAuthority("change_refund_account", ({ taxpayer, actor, db }) => changeRefundAccount(taxpayer, actor, db));

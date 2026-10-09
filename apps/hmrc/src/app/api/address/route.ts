import { requireDelegatedAuthority } from "@/lib/delegated-authority";
import { changeAddress } from "@/lib/taxpayers";

export const dynamic = "force-dynamic";
export const POST = requireDelegatedAuthority("change_address", ({ taxpayer, actor, db }) => changeAddress(taxpayer, actor, db));

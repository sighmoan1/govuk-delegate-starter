import { requireDelegatedAuthority } from "@/lib/delegated-authority";
import { updateEmployment } from "@/lib/taxpayers";

export const dynamic = "force-dynamic";
export const POST = requireDelegatedAuthority("update_employment", ({ taxpayer, actor, body }) => updateEmployment(taxpayer, actor, body));

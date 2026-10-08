import { requireDelegatedAuthority } from "@/lib/delegated-authority";
import { answerQuery } from "@/lib/taxpayers";

export const dynamic = "force-dynamic";
export const POST = requireDelegatedAuthority("respond_to_query", ({ taxpayer, actor, body }) => answerQuery(taxpayer, actor, body));

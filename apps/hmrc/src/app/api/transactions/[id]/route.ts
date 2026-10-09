import { requireDelegatedAuthority } from "@/lib/delegated-authority";
import { transactionStatus } from "@/lib/transactions";

export const dynamic = "force-dynamic";

const idOf = (req: Request) => decodeURIComponent(new URL(req.url).pathname.split("/").filter(Boolean).at(-1) ?? "");

// Where a claim received for later processing has got to. Guarded like the rest of the claims API: the person, or an
// agent they have given view_claim_status. The domain rules (domain-policy.ts) make a receipt visible only to the
// person it is for; anyone else's id gets the same 404 as an id that does not exist.
export const GET = requireDelegatedAuthority(
  "view_claim_status",
  ({ taxpayer, body }) => transactionStatus(taxpayer.oneLoginSubject, String(body.transaction_id)),
  { extraBody: (req) => ({ transaction_id: idOf(req) }) },
);

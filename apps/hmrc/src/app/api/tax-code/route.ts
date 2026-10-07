import { requireDelegatedAuthority } from "@/lib/delegated-authority";
import { viewTaxCode } from "@/lib/taxpayers";

export const dynamic = "force-dynamic";
export const GET = requireDelegatedAuthority("view_tax_code", ({ taxpayer }) => viewTaxCode(taxpayer));

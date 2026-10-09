"use server";

import { narrowMandateConstraints } from "@/lib/constraint-narrowing";
import { constraintsFromForm, validateConstraints } from "@/lib/constraints";
import type { CatalogueCapability } from "@/lib/catalogues";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { revokeAuthorisation, DomainError } from "@/lib/requests";
import { narrowAuthorisation, disputeReceipt } from "@/lib/receipts";
import { currentPrincipal } from "@/lib/session";

async function requirePrincipal(back: string) {
  const p = await currentPrincipal();
  if (!p) redirect(`/auth/login?returnTo=${encodeURIComponent(back)}`);
  return p;
}

export async function revokeAction(formData: FormData) {
  const id = String(formData.get("id"));
  const principal = await requirePrincipal(`/account/delegates/${id}`);
  try {
    await revokeAuthorisation(id, principal.id);
  } catch (e) {
    if (!(e instanceof DomainError)) throw e;
  }
  redirect(`/account/delegates/${id}?removed=1`);
}

export async function narrowAction(formData: FormData) {
  const id = String(formData.get("id"));
  const principal = await requirePrincipal(`/account/delegates/${id}`);
  try {
    await narrowAuthorisation(id, principal.id, String(formData.get("capability")));
  } catch (e) {
    if (!(e instanceof DomainError)) throw e;
  }
  redirect(`/account/delegates/${id}?narrowed=1`);
}

export async function disputeAction(formData: FormData) {
  const receiptId = String(formData.get("receipt"));
  const principal = await requirePrincipal("/account/delegates");
  let id = "";
  try {
    id = await disputeReceipt(receiptId, principal.id);
  } catch (e) {
    if (!(e instanceof DomainError)) throw e;
    redirect("/account/delegates");
  }
  redirect(`/account/delegates/${id}?disputed=1`);
}

export async function narrowRestrictionsAction(formData:FormData) {
 const id=String(formData.get("id"));
 const principal=await requirePrincipal(`/account/delegates/${id}`);
 const mandate=await prisma.authorisation.findUnique({where:{id},include:{permissions:{include:{capability:true}}}});
 if(!mandate || mandate.principalId!==principal.id) redirect("/account/delegates");
 try {
  const proposed=validateConstraints(mandate.constraints,mandate.permissions.map(p=>p.capability.metadata as unknown as CatalogueCapability));
  await narrowMandateConstraints(id,principal.id,constraintsFromForm(formData,proposed,mandate.permissions.map(p=>p.capability.code)));
 } catch(e) { if(!(e instanceof DomainError)) throw e; redirect(`/account/delegates/${id}?restrictions=error`); }
 redirect(`/account/delegates/${id}?restrictions=saved`);
}

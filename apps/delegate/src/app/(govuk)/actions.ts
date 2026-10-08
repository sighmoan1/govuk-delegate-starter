"use server";

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

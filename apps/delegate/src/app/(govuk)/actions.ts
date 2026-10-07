"use server";

import { redirect } from "next/navigation";
import { revokeAuthorisation, DomainError } from "@/lib/requests";
import { currentPrincipal } from "@/lib/session";

async function requirePrincipal(back: string) {
  const p = await currentPrincipal();
  if (!p) redirect(`/consent-signin?returnTo=${encodeURIComponent(back)}`);
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

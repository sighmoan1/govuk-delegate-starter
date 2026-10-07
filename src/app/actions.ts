"use server";

import { redirect } from "next/navigation";
import { approveRequest, rejectRequest, revokeAuthorisation, DomainError } from "@/lib/requests";
import { currentPrincipal } from "@/lib/session";

async function requirePrincipal(returnTo: string) {
  const p = await currentPrincipal();
  if (!p) redirect(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  return p;
}

export async function approveAction(formData: FormData) {
  const id = String(formData.get("id"));
  const principal = await requirePrincipal(`/requests/${id}`);
  const caps = formData.getAll("c").map(String);
  try {
    await approveRequest(id, principal.id, caps);
  } catch (e) {
    if (e instanceof DomainError) redirect(`/requests/${id}?error=${e.code}`);
    throw e;
  }
  redirect(`/requests/${id}/confirmation`);
}

export async function rejectAction(formData: FormData) {
  const id = String(formData.get("id"));
  const principal = await requirePrincipal(`/requests/${id}`);
  try {
    await rejectRequest(id, principal.id);
  } catch (e) {
    if (!(e instanceof DomainError)) throw e;
  }
  redirect(`/delegates?rejected=1`);
}

export async function revokeAction(formData: FormData) {
  const id = String(formData.get("id"));
  const principal = await requirePrincipal(`/authorisations/${id}`);
  try {
    await revokeAuthorisation(id, principal.id);
  } catch (e) {
    if (!(e instanceof DomainError)) throw e;
  }
  redirect(`/authorisations/${id}?revoked=1`);
}

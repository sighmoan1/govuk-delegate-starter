"use server";

import { redirect } from "next/navigation";
import { clearFlow, completeWithSimulator, readFlow, writeFlow } from "@/lib/flow";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function submitEmail(formData: FormData) {
  const flow = await readFlow();
  if (!flow) redirect("/expired");
  const email = String(formData.get("email") ?? "").trim();
  if (!EMAIL.test(email)) redirect(`/sign-in?error=email${email ? `&value=${encodeURIComponent(email)}` : ""}`);
  await writeFlow({ ...flow, email });
  redirect("/enter-password");
}

export async function submitPassword(formData: FormData) {
  const flow = await readFlow();
  if (!flow?.email) redirect("/expired");
  if (!String(formData.get("password") ?? "")) redirect("/enter-password?error=password");
  // Any password works: this stands in for One Login's checks.
  const back = await completeWithSimulator(flow, flow.email);
  await clearFlow();
  redirect(back);
}

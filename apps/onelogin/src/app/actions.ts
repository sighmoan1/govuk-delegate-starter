"use server";

import { redirect } from "next/navigation";
import { checkCode, clearFlow, completeWithSimulator, demoEmail, demoPassword, readFlow, sendCode, strict, writeFlow } from "@/lib/flow";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function submitEmail(formData: FormData) {
  const flow = await readFlow();
  if (!flow) redirect("/expired");
  const email = String(formData.get("email") ?? "").trim();
  if (!EMAIL.test(email)) redirect(`/sign-in?error=email${email ? `&value=${encodeURIComponent(email)}` : ""}`);
  if (strict() && email.toLowerCase() !== demoEmail()) redirect(`/sign-in?error=unknown&value=${encodeURIComponent(email)}`);
  await writeFlow({ ...flow, email, passwordOk: false });
  redirect("/enter-password");
}

export async function submitPassword(formData: FormData) {
  const flow = await readFlow();
  if (!flow?.email) redirect("/expired");
  const password = String(formData.get("password") ?? "");
  if (!password) redirect("/enter-password?error=password");
  if (strict()) {
    if (password !== demoPassword()) redirect("/enter-password?error=wrong");
    // Then a code, sent to the person's phone.
    sendCode();
    await writeFlow({ ...flow, passwordOk: true });
    redirect("/check-phone");
  }
  // Locally any password works: this stands in for One Login's checks.
  const back = await completeWithSimulator(flow, flow.email);
  await clearFlow();
  redirect(back);
}

export async function submitCode(formData: FormData) {
  const flow = await readFlow();
  if (!flow?.email || !flow.passwordOk || !strict()) redirect("/expired");
  if (!checkCode(String(formData.get("code") ?? ""))) redirect("/check-phone?error=code");
  const back = await completeWithSimulator(flow, flow.email);
  await clearFlow();
  redirect(back);
}

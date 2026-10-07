"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CONV_COOKIE, createConversation } from "@/lib/agent/conversation";
import { handleUserMessage } from "@/lib/agent/agent";
import { DEMO_COOKIE } from "@/lib/demo-state";

const cookieOpts = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 6 };

export async function sendMessage(formData: FormData) {
  const text = String(formData.get("text") ?? "");
  const jar = await cookies();
  let id = jar.get(CONV_COOKIE)?.value;
  if (!id) {
    id = (await createConversation()).id;
    jar.set(CONV_COOKIE, id, cookieOpts);
    jar.set(DEMO_COOKIE, new Date().toISOString(), cookieOpts);
  }
  try {
    await handleUserMessage(id, text);
  } catch {
    // Stale cookie (e.g. after a reseed): start again.
    const fresh = await createConversation();
    jar.set(CONV_COOKIE, fresh.id, cookieOpts);
    await handleUserMessage(fresh.id, text);
  }
  redirect("/example-ai#latest");
}

export async function newChat() {
  const jar = await cookies();
  jar.delete(CONV_COOKIE);
  jar.delete(DEMO_COOKIE);
  redirect("/example-ai");
}

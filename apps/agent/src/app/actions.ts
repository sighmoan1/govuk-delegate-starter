"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { handleMessage } from "@/lib/assistant";

export async function send(formData: FormData) {
  await handleMessage(String(formData.get("text") ?? ""));
  redirect("/#latest");
}

export async function newChat() {
  await prisma.message.deleteMany();
  redirect("/");
}

export async function disconnect() {
  await prisma.connection.deleteMany();
  redirect("/settings");
}

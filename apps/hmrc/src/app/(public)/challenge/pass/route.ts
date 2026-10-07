import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { CHALLENGE_COOKIE } from "@/lib/friction";

export async function POST(req: Request) {
  const form = await req.formData();
  const returnTo = String(form.get("returnTo") ?? "/your-tax");
  const safe = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/your-tax";
  if (form.get("person") !== "yes") return NextResponse.redirect(new URL(`/challenge?returnTo=${encodeURIComponent(safe)}`, config.appUrl), 303);
  const res = NextResponse.redirect(new URL(safe, config.appUrl), 303);
  res.cookies.set(CHALLENGE_COOKIE, "1", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}

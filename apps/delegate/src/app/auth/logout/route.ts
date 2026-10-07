import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { SESSION_COOKIE } from "@/lib/session";

export async function POST() {
  const res = NextResponse.redirect(new URL("/", config.appUrl), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}

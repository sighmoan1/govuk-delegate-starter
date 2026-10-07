import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { AGENT_SESSION_COOKIE, PENDING_COOKIE } from "@/lib/agent-session";

export async function GET(req: Request) {
  const ended = new URL(req.url).searchParams.get("ended");
  const res = NextResponse.redirect(new URL(ended ? `/act-for-someone?ended=${ended}` : "/", config.appUrl), 303);
  res.cookies.delete(AGENT_SESSION_COOKIE);
  res.cookies.delete(PENDING_COOKIE);
  return res;
}

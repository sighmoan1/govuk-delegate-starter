import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { CONV_COOKIE } from "@/lib/agent/conversation";
import { handleConsentReturn } from "@/lib/agent/agent";
import { cookieFromHeader } from "@/lib/session";

// Where GOV.UK Delegate sends the person back after they decide. The agent does
// not trust the status in the URL: handleConsentReturn asks Delegate.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const conv = url.searchParams.get("conv");
  const requestId = url.searchParams.get("request_id");
  const mine = cookieFromHeader(req.headers.get("cookie"), CONV_COOKIE);
  if (conv && requestId && conv === mine) {
    await handleConsentReturn(conv, requestId);
  }
  return NextResponse.redirect(new URL("/example-ai#latest", config.appUrl), 303);
}

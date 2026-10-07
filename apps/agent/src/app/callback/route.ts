import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { handleReturn } from "@/lib/assistant";

// Where GOV.UK sends Sam back after deciding. The status in the URL is not
// trusted: handleReturn asks GOV.UK Delegate what actually happened.
export async function GET(req: Request) {
  const requestId = new URL(req.url).searchParams.get("request_id");
  if (requestId) await handleReturn(requestId);
  return NextResponse.redirect(new URL("/#latest", config.appUrl), 303);
}

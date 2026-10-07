import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { resumeRun } from "@/lib/runner";

// Where GOV.UK Delegate sends Sam back after deciding. The status in the URL
// is not trusted: resumeRun asks Delegate what actually happened.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const run = url.searchParams.get("run");
  const requestId = url.searchParams.get("request_id");
  if (run && requestId) await resumeRun(run, requestId);
  return NextResponse.redirect(new URL("/#log", config.appUrl), 303);
}

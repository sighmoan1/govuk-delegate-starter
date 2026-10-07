import { NextResponse } from "next/server";
import { writeFlow } from "@/lib/flow";

// A relying party (GOV.UK Delegate or HMRC) sends the person here. Keep its
// request, and ask the person to sign in.
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!url.searchParams.get("client_id") || !url.searchParams.get("redirect_uri")) {
    return new NextResponse("Invalid sign-in request.", { status: 400 });
  }
  await writeFlow({ authorize: url.searchParams.toString() });
  return NextResponse.redirect(new URL("/sign-in", url), 303);
}

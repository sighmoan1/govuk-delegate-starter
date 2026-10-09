import { NextResponse, type NextRequest } from "next/server";

// Evidence for the live agent runs: one line per page request saying what the
// visitor sent about itself. Headers only; nothing is blocked or changed here.
export function middleware(req: NextRequest) {
  const h = req.headers;
  console.log("VISIT " + JSON.stringify({
    t: new Date().toISOString(),
    method: req.method,
    path: req.nextUrl.pathname,
    ua: h.get("user-agent")?.slice(0, 200) ?? null,
    signatureAgent: h.get("signature-agent"),
    signed: Boolean(h.get("signature-input")),
    country: h.get("cf-ipcountry"),
    secFetch: h.get("sec-fetch-site") ? `${h.get("sec-fetch-site")}/${h.get("sec-fetch-mode")}` : null,
    referer: h.get("referer"),
  }));
  const headers = new Headers(req.headers);
  headers.set("x-prototype-request-target", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/((?!_next/|favicon.ico).*)"] };

import { NextResponse, type NextRequest } from "next/server";
// Overwrite caller input. Server components need the exact signature-covered target, including query.
export function middleware(req: NextRequest) {
 const headers = new Headers(req.headers);
 headers.set("x-prototype-request-target", req.nextUrl.pathname + req.nextUrl.search);
 return NextResponse.next({request:{headers}});
}
export const config = {matcher:["/((?!_next/|favicon.ico).*)"]};

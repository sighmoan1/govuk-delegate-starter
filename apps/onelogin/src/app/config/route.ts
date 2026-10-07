import { NextResponse } from "next/server";

// The simulator's configuration endpoint is not public. This app reaches it
// directly on the internal network.
const notFound = () => new NextResponse("Not found", { status: 404 });
export { notFound as GET, notFound as POST, notFound as PUT, notFound as DELETE };

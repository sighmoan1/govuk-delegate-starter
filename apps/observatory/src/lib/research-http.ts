import { gate, ResearchError } from "./ground-truth";
export function researchRoute(kind: "evaluation" | "collection", handler: (req: Request) => Promise<unknown>) {
  return async (req: Request) => {
    const headers = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };
    const denied = gate(req, kind);
    if (denied) return Response.json({ error: denied === 503 ? "RESEARCH_ACCESS_DISABLED" : "RESEARCH_AUTHENTICATION_REQUIRED" }, { status: denied, headers });
    try { return Response.json(await handler(req), { headers }); }
    catch (e) { return Response.json({ error: e instanceof ResearchError ? e.code : "RESEARCH_UNAVAILABLE" }, { status: e instanceof ResearchError ? e.status : 503, headers }); }
  };
}
export async function researchBody(req: Request) {
  const body = await req.text(); if (body.length > 256_000) throw new ResearchError("BODY_TOO_LARGE", 413);
  try { return JSON.parse(body); } catch { throw new ResearchError("INVALID_JSON"); }
}

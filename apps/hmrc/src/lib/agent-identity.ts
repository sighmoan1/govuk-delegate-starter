import { readFileSync } from "node:fs";
import { KNOWN_AGENTS, verifyOncePerRequest, authorityFromHeaders, fromRequest, type TrustedAgent, type Directory } from "@prototype/web-bot-auth";

/** Agents whose Web Bot Auth signatures we recognise. The test agent only outside public mode. */
export function trustedAgents(): TrustedAgent[] {
  if (process.env.PUBLIC_MODE === "true") return KNOWN_AGENTS;
  try {
    const dir = JSON.parse(readFileSync(process.env.TEST_AGENT_JWKS ?? "../../dev/test-agent.jwks.json", "utf8")) as Directory;
    return [...KNOWN_AGENTS, { agent: "https://test-agent.local", name: "Test agent", directory: dir }];
  } catch {
    return KNOWN_AGENTS;
  }
}

/** Is this request signed by a known agent's operator? */
/** x-forwarded-host is honoured only when a trusted reverse proxy is declared (TRUSTED_PROXY=true). */
const trustProxy = () => process.env.TRUSTED_PROXY === "true";
export const verifyAgentSignature = (req: Request) => verifyOncePerRequest(req, fromRequest(req, { trustForwardedHost: trustProxy() }), { trusted: trustedAgents() });

/** For server components and pages, where there is no Request object: the path is known to the page. */
export async function verifyAgentSignatureFromHeaders(h: Headers, method: string, path: string) {
  const headers: Record<string, string> = {};
  h.forEach((v, k) => { headers[k] = v; });
  return verifyOncePerRequest(h, { method, authority: authorityFromHeaders(headers, trustProxy()), path: headers["x-prototype-request-target"] ?? path, headers }, { trusted: trustedAgents() });
}

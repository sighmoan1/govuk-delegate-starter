import { readFileSync } from "node:fs";
import { KNOWN_AGENTS, verifyRequest, fromRequest, type TrustedAgent, type Directory } from "@prototype/web-bot-auth";

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
export const verifyAgentSignature = (req: Request) => verifyRequest(fromRequest(req), { trusted: trustedAgents() });

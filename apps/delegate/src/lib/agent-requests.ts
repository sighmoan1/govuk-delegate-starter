// An agent that has arrived at a service (in a browser, without its own
// Delegate credentials) asks to act for someone. The service raises the
// request on its behalf; the person approves on GOV.UK with a short code.
import { currentCapabilities } from "./catalogues";
import { prisma } from "./db";
import { DomainError } from "./requests";
import { userCode, rootDelegationFor } from "./authority";
import { signDelegationToken } from "./agent-auth";
import { trustedAgents } from "./agent-identity";

const FIFTEEN_MINUTES = 15 * 60_000;

export type ArrivingAgent =
  | { kind: "verified"; webBotAuthAgent: string }
  | { kind: "declared"; name: string; provider: string };

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "agent";

/** The registry entry for an agent, created on first appearance. */
export async function agentDelegateFor(agent: ArrivingAgent) {
  if (agent.kind === "verified") {
    const known = trustedAgents().find((t) => t.agent === agent.webBotAuthAgent);
    if (!known) throw new DomainError("UNTRUSTED_AGENT", "Unrecognised agent operator");
    return prisma.delegate.upsert({
      where: { webBotAuthAgent: agent.webBotAuthAgent },
      update: {},
      create: {
        name: known.name, type: "SOFTWARE_AGENT", provider: new URL(agent.webBotAuthAgent).host,
        clientId: `wba:${new URL(agent.webBotAuthAgent).host}`, clientSecretHash: "none",
        identityType: "WEB_BOT_AUTH", webBotAuthAgent: agent.webBotAuthAgent, redirectUris: [],
      },
    });
  }
  const name = agent.name.trim().slice(0, 60);
  const provider = agent.provider.trim().slice(0, 60);
  if (!name || !provider) throw new DomainError("AGENT_NAME_REQUIRED", "Say which assistant you are and who provides it");
  const clientId = `declared:${slug(name)}:${slug(provider)}`;
  return prisma.delegate.upsert({
    where: { clientId },
    update: {},
    create: { name, type: "SOFTWARE_AGENT", provider, clientId, clientSecretHash: "none", identityType: "DECLARED", redirectUris: [] },
  });
}

export async function createServiceInitiatedRequest(serviceId: string, agent: ArrivingAgent, capabilities: string[]) {
  const service = await prisma.service.findUniqueOrThrow({ where: { id: serviceId }, include: { capabilities: true } });
  const wanted = [...new Set(capabilities)];
  const caps = (await currentCapabilities(service.id)).filter((c) => wanted.includes(c.code));
  if (caps.length === 0 || caps.length !== wanted.length) throw new DomainError("UNKNOWN_CAPABILITY", "Ask for at least one of this service's actions");
  const delegate = await agentDelegateFor(agent);
  const req = await prisma.authorisationRequest.create({
    data: {
      delegateId: delegate.id,
      serviceId,
      userCode: userCode(),
      initiatedByServiceId: serviceId,
      requestedAssurance: delegate.identityType === "WEB_BOT_AUTH" ? "VERIFIED" : "DECLARED",
      expiresAt: new Date(Date.now() + FIFTEEN_MINUTES),
      permissions: { create: caps.map((c) => ({ capabilityId: c.id })) },
    },
  });
  return { request: req, delegate };
}

/** For the service that raised it: has the person decided? If approved, a token for the agent's delegation. */
export async function requestStatusForService(requestId: string, serviceId: string) {
  const req = await prisma.authorisationRequest.findUnique({
    where: { id: requestId },
    include: { delegate: true, authorisation: { include: { permissions: { include: { capability: true } } } }, principal: true },
  });
  if (!req || req.initiatedByServiceId !== serviceId) return null;
  if (req.status === "PENDING" && req.expiresAt <= new Date()) {
    await prisma.authorisationRequest.update({ where: { id: req.id }, data: { status: "EXPIRED" } });
    return { status: "EXPIRED" as const };
  }
  if (req.status !== "APPROVED" || !req.authorisation || !req.principal) return { status: req.status };
  const root = await rootDelegationFor(req.authorisation);
  return {
    status: "APPROVED" as const,
    principal_id: req.principal.id,
    subject: req.principal.oneLoginSubjectId,
    agent: { name: req.delegate.name, provider: req.delegate.provider, web_bot_auth_agent: req.delegate.webBotAuthAgent },
    delegation_id: root.id,
    assurance: root.assurance,
    granted: root.capabilities,
    delegation_token: await signDelegationToken(root.id, 4 * 3600),
  };
}

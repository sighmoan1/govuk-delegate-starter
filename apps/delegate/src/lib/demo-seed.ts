// The demo's starting state, used by `npm run db:reset` and by the reset button
// on the about site. Idempotent: wipes Delegate's tables and rebuilds them.
import { scryptSync, randomBytes } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma";

const hash = (s: string) => {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(s, salt, 32).toString("hex")}`;
};

// One Login subject of the seeded person (sam.taylor@example.com).
export const SUBJECT = "urn:fdc:gov.uk:2022:56P4CMsGh_02YOlWpd8PAOI-2sVlB2nsNU7mcLZYhYw=";
// The one return URL the seeded agent has registered. No app listens here.
export const DEMO_AGENT_RETURN_URL = "https://assistant.example/callback";
const MIN = 60_000;
const DAY = 86_400_000;

export type SeedOptions = { withAuthority?: boolean };
export type SeedResult = { principalId: string; granted: string[] };

export async function seedDemo(prisma: PrismaClient, opts: SeedOptions = {}): Promise<SeedResult> {
  // Idempotent: re-running restores the clean demo starting state.
  await prisma.receipt.deleteMany();
  await prisma.capacityUse.deleteMany();
  await prisma.stepUp.deleteMany();
  await prisma.delegation.deleteMany();
  await prisma.activityEvent.deleteMany();
  await prisma.authorisationRequest.deleteMany();
  await prisma.authorisation.deleteMany();
  await prisma.capability.deleteMany();
  await prisma.service.deleteMany();
  await prisma.delegate.deleteMany();
  await prisma.principal.deleteMany();

  const principal = await prisma.principal.create({
    data: { oneLoginSubjectId: SUBJECT, displayName: "Sam Taylor" },
  });

  const delegate = await prisma.delegate.create({
    data: {
      name: "Personal assistant",
      type: "SOFTWARE_AGENT",
      provider: "Assistant Ltd",
      clientId: process.env.DEMO_AGENT_CLIENT_ID ?? "demo-personal-agent",
      clientSecretHash: hash(process.env.DEMO_AGENT_CLIENT_SECRET ?? "dev-demo-agent-secret"),
      redirectUris: [DEMO_AGENT_RETURN_URL],
    },
  });

  // HMRC registers once: a name, a slug and a key it will present to the check API.
  const service = await prisma.service.create({
    data: {
      name: "HMRC",
      slug: "hmrc-personal-tax",
      apiKeyHash: hash(process.env.HMRC_SERVICE_KEY ?? "dev-hmrc-service-key"),
    },
  });
  const defs = [
    ["view_tax_code", "View your tax code", "LOW", false],
    ["claim_job_expenses", "Claim tax relief for working from home", "MEDIUM", false],
    ["update_employment", "Update your employment details", "MEDIUM", false],
    ["change_refund_account", "Change the bank account for refunds", "HIGH", true],
    ["change_address", "Change your address", "HIGH", true],
    ["view_claim_status", "See how your claims are going", "LOW", false],
    ["respond_to_query", "Answer HMRC’s questions about your claim, once you have agreed the answer", "MEDIUM", false],
    ["check_claim_progress", "Check your claim progress on a schedule (a few times a day)", "LOW", false],
  ] as const;
  const caps: Record<string, string> = {};
  for (const [i, [code, name, risk, step]] of defs.entries()) {
    const c = await prisma.capability.create({
      data: { serviceId: service.id, code, name, riskLevel: risk, requiresStepUp: step, sortOrder: i },
    });
    caps[code] = c.id;
  }

  // History so the activity view is useful before the first demo transaction:
  // an earlier relationship, since removed, plus some traffic outside the trusted lane.
  const now = Date.now();
  const past = await prisma.authorisation.create({
    data: {
      principalId: principal.id,
      delegateId: delegate.id,
      serviceId: service.id,
      status: "REVOKED",
      validFrom: new Date(now - 20 * 86_400_000),
      validUntil: new Date(now + 10 * 86_400_000),
      revokedAt: new Date(now - 90 * MIN),
      permissions: { create: [caps.view_tax_code, caps.claim_job_expenses].map((capabilityId) => ({ capabilityId })) },
    },
  });

  const ev = (minsAgo: number, e: {
    lane: "AUTHORISED_AGENT" | "AUTHENTICATED_HUMAN" | "UNTRUSTED";
    decision: "ALLOW" | "DENY";
    reason: "VALID_AUTHORISATION" | "PERMISSION_MISSING" | "AUTHORISATION_REVOKED" | "UNKNOWN_DELEGATE" | "INVALID_AGENT_AUTHENTICATION" | "HUMAN_SESSION" | "RATE_LIMITED";
    capability: string;
    declared?: boolean;
    presentedClientId?: string;
  }) => ({
    timestamp: new Date(now - minsAgo * MIN),
    requestId: crypto.randomUUID(),
    lane: e.lane,
    decision: e.decision,
    reason: e.reason,
    capability: e.capability,
    serviceId: service.id,
    presentedClientId: e.presentedClientId ?? null,
    ...(e.declared ? { principalId: principal.id, delegateId: delegate.id, authorisationId: past.id } : {}),
  });

  const agent = (m: number, capability: string, ok: boolean, reason?: "PERMISSION_MISSING" | "AUTHORISATION_REVOKED") =>
    ev(m, { lane: "AUTHORISED_AGENT", decision: ok ? "ALLOW" : "DENY", reason: ok ? "VALID_AUTHORISATION" : reason!, capability, declared: true });

  await prisma.activityEvent.createMany({
    data: [
      agent(300, "view_tax_code", true),
      agent(298, "claim_job_expenses", true),
      agent(240, "view_tax_code", true),
      agent(235, "change_refund_account", false, "PERMISSION_MISSING"),
      agent(180, "view_tax_code", true),
      agent(176, "claim_job_expenses", true),
      agent(170, "update_employment", false, "PERMISSION_MISSING"),
      agent(120, "view_tax_code", true),
      agent(95, "view_tax_code", true),
      agent(80, "view_tax_code", false, "AUTHORISATION_REVOKED"),
      agent(78, "claim_job_expenses", false, "AUTHORISATION_REVOKED"),
      ev(260, { lane: "AUTHENTICATED_HUMAN", decision: "ALLOW", reason: "HUMAN_SESSION", capability: "view_tax_code" }),
      ev(150, { lane: "AUTHENTICATED_HUMAN", decision: "ALLOW", reason: "HUMAN_SESSION", capability: "view_tax_code" }),
      ...[210, 209, 208, 207, 206, 205].map((m, i) =>
        ev(m, { lane: "UNTRUSTED", decision: "DENY", reason: i === 5 ? "RATE_LIMITED" : "INVALID_AGENT_AUTHENTICATION", capability: "view_tax_code" })),
      ev(130, { lane: "UNTRUSTED", decision: "DENY", reason: "UNKNOWN_DELEGATE", capability: "view_tax_code", presentedClientId: "unregistered-helper-bot" }),
    ],
  });

  // Optional starting point: Sam has already let the assistant view her tax code
  // and claim working-from-home relief, as if she had done it on the consent screen.
  const granted = ["view_tax_code", "claim_job_expenses"];
  if (opts.withAuthority) {
    const now = Date.now();
    const auth = await prisma.authorisation.create({
      data: {
        principalId: principal.id,
        delegateId: delegate.id,
        serviceId: service.id,
        validFrom: new Date(now - 5 * MIN),
        validUntil: new Date(now + 30 * DAY),
        permissions: { create: granted.map((c) => ({ capabilityId: caps[c] })) },
      },
    });
    await prisma.delegation.create({
      data: { mandateId: auth.id, delegateId: delegate.id, depth: 0, capabilities: granted, assurance: "REGISTERED" },
    });
    await prisma.authorisationRequest.create({
      data: {
        principalId: principal.id,
        delegateId: delegate.id,
        serviceId: service.id,
        status: "APPROVED",
        expiresAt: new Date(now + 7 * DAY),
        respondedAt: new Date(now - 5 * MIN),
        authorisationId: auth.id,
        permissions: { create: granted.map((c) => ({ capabilityId: caps[c] })) },
      },
    });
  }
  return { principalId: principal.id, granted: opts.withAuthority ? granted : [] };
}

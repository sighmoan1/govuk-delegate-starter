import { PrismaClient } from "@prisma/client";
import { scryptSync, randomBytes } from "node:crypto";

const prisma = new PrismaClient();

const hash = (s: string) => {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(s, salt, 32).toString("hex")}`;
};

// The simulator's default test subject, so "Continue" on its form signs this principal in.
const SUBJECT = "urn:fdc:gov.uk:2022:56P4CMsGh_02YOlWpd8PAOI-2sVlB2nsNU7mcLZYhYw=";
const MIN = 60_000;

async function main() {
  if (process.argv.includes("--if-empty") && (await prisma.principal.count()) > 0) {
    console.log("Database already seeded; leaving it alone.");
    return;
  }
  // Idempotent: re-running restores the clean demo starting state.
  await prisma.activityEvent.deleteMany();
  await prisma.authorisationRequest.deleteMany();
  await prisma.authorisation.deleteMany();
  await prisma.capability.deleteMany();
  await prisma.service.deleteMany();
  await prisma.delegate.deleteMany();
  await prisma.principal.deleteMany();

  const principal = await prisma.principal.create({
    data: { oneLoginSubjectId: SUBJECT, displayName: "Sam Example (synthetic)" },
  });

  const delegate = await prisma.delegate.create({
    data: {
      name: "Demo Personal Agent",
      type: "SOFTWARE_AGENT",
      provider: "Example AI Ltd",
      clientId: process.env.DEMO_AGENT_CLIENT_ID ?? "demo-personal-agent",
      clientSecretHash: hash(process.env.DEMO_AGENT_CLIENT_SECRET ?? "dev-demo-agent-secret"),
    },
  });

  const service = await prisma.service.create({ data: { name: "DWP Benefits Demo", slug: "dwp-benefits" } });
  const defs = [
    ["check_claim_status", "Check claim status", "LOW", false],
    ["submit_evidence", "Submit evidence", "MEDIUM", false],
    ["report_change", "Report change", "MEDIUM", false],
    ["change_payment_details", "Change payment details", "HIGH", true],
    ["withdraw_claim", "Withdraw claim", "HIGH", true],
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
      permissions: { create: [caps.check_claim_status, caps.submit_evidence].map((capabilityId) => ({ capabilityId })) },
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
      agent(300, "check_claim_status", true),
      agent(298, "submit_evidence", true),
      agent(240, "check_claim_status", true),
      agent(235, "change_payment_details", false, "PERMISSION_MISSING"),
      agent(180, "check_claim_status", true),
      agent(176, "submit_evidence", true),
      agent(170, "report_change", false, "PERMISSION_MISSING"),
      agent(120, "check_claim_status", true),
      agent(95, "check_claim_status", true),
      agent(80, "check_claim_status", false, "AUTHORISATION_REVOKED"),
      agent(78, "submit_evidence", false, "AUTHORISATION_REVOKED"),
      ev(260, { lane: "AUTHENTICATED_HUMAN", decision: "ALLOW", reason: "HUMAN_SESSION", capability: "check_claim_status" }),
      ev(150, { lane: "AUTHENTICATED_HUMAN", decision: "ALLOW", reason: "HUMAN_SESSION", capability: "check_claim_status" }),
      ...[210, 209, 208, 207, 206, 205].map((m, i) =>
        ev(m, { lane: "UNTRUSTED", decision: "DENY", reason: i === 5 ? "RATE_LIMITED" : "INVALID_AGENT_AUTHENTICATION", capability: "check_claim_status" })),
      ev(130, { lane: "UNTRUSTED", decision: "DENY", reason: "UNKNOWN_DELEGATE", capability: "check_claim_status", presentedClientId: "unregistered-helper-bot" }),
    ],
  });
  console.log("Seeded: 1 principal, Demo Personal Agent, DWP Benefits Demo, 5 capabilities, history events.");
}

main().finally(() => prisma.$disconnect());

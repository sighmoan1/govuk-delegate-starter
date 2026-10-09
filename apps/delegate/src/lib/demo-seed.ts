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
  const registeredService = await prisma.service.findUniqueOrThrow({where:{slug:process.env.DEMO_SERVICE_SLUG ?? "hmrc-personal-tax"}});
  const publication = await prisma.serviceCatalogue.findFirst({where:{serviceId:registeredService.id},orderBy:{version:"desc"}});
  const definitions = await prisma.capability.findMany({where:{serviceId:registeredService.id,catalogueId:publication?.id??null},orderBy:{sortOrder:"asc"}});
  if(!definitions.length) throw new Error("Register the service catalogue before seeding citizen fixtures.");
  const granted = definitions.filter(c => !c.requiresStepUp).slice(0, 2).map(c => c.code);
  const caps = Object.fromEntries(definitions.map(c => [c.code,c.id]));
  const read = definitions[0].code;
  const write = granted[1] ?? read;
  const consequential = definitions.find(c => c.requiresStepUp)?.code ?? read;
  const other = definitions.find(c => !granted.includes(c.code))?.code ?? read;

  // Idempotent: re-running restores the clean demo starting state.
  await prisma.receipt.deleteMany();
  await prisma.stepUp.deleteMany();
  await prisma.delegation.deleteMany();
  await prisma.activityEvent.deleteMany();
  await prisma.authorisationRequest.deleteMany();
  await prisma.authorisation.deleteMany();
  // Service identities and immutable catalogue publications survive a citizen demo reset.
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

  const service = registeredService;

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
      permissions: { create: granted.map(code => caps[code]).map((capabilityId) => ({ capabilityId })) },
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
      agent(300, read, true),
      agent(298, write, true),
      agent(240, read, true),
      agent(235, consequential, false, "PERMISSION_MISSING"),
      agent(180, read, true),
      agent(176, write, true),
      agent(170, other, false, "PERMISSION_MISSING"),
      agent(120, read, true),
      agent(95, read, true),
      agent(80, read, false, "AUTHORISATION_REVOKED"),
      agent(78, write, false, "AUTHORISATION_REVOKED"),
      ev(260, { lane: "AUTHENTICATED_HUMAN", decision: "ALLOW", reason: "HUMAN_SESSION", capability: read }),
      ev(150, { lane: "AUTHENTICATED_HUMAN", decision: "ALLOW", reason: "HUMAN_SESSION", capability: read }),
      ...[210, 209, 208, 207, 206, 205].map((m, i) =>
        ev(m, { lane: "UNTRUSTED", decision: "DENY", reason: i === 5 ? "RATE_LIMITED" : "INVALID_AGENT_AUTHENTICATION", capability: read })),
      ev(130, { lane: "UNTRUSTED", decision: "DENY", reason: "UNKNOWN_DELEGATE", capability: read, presentedClientId: "unregistered-helper-bot" }),
    ],
  });

  // Optional starting point: Sam has already let the assistant view her tax code
  // and claim working-from-home relief, as if she had done it on the consent screen.
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

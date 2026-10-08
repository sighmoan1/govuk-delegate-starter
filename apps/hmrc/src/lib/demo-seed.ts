// HMRC's demo starting state: Sam's record and a day of traffic history.
// Used by `npm run db:reset` and the about site's reset button.
import type { PrismaClient } from "@/generated/prisma";

// One Login subject of the seeded person (sam.taylor@example.com).
const SUBJECT = "urn:fdc:gov.uk:2022:56P4CMsGh_02YOlWpd8PAOI-2sVlB2nsNU7mcLZYhYw=";
const MIN = 60_000;

export async function seedDemo(prisma: PrismaClient) {
  await prisma.principalUsage.deleteMany();
  await prisma.idempotencyRecord.deleteMany();
  await prisma.serviceEvent.deleteMany();
  await prisma.claim.deleteMany();
  await prisma.taxpayer.deleteMany();

  await prisma.taxpayer.create({
    data: { oneLoginSubject: SUBJECT, name: "Sam Taylor", taxCode: "1257L", employer: "Northwind Analytics Ltd", taxYear: "2026 to 2027" },
  });

  // A day of traffic so the operations view means something before the demo.
  const now = Date.now();
  const ev = (minsAgo: number, e: { lane: "AUTHENTICATED_HUMAN" | "AUTHORISED_AGENT" | "UNTRUSTED"; outcome: "ALLOWED" | "REFUSED" | "THROTTLED" | "CHALLENGED"; reason?: string; capability?: string; path: string; agentName?: string; subject?: string; latencyMs: number }) => ({
    timestamp: new Date(now - minsAgo * MIN),
    lane: e.lane, outcome: e.outcome, reason: e.reason ?? null, capability: e.capability ?? null, path: e.path,
    agentName: e.agentName ?? null, agentId: e.agentName ? "seeded" : null, subject: e.subject ?? null, latencyMs: e.latencyMs,
  });
  const human = (m: number, cap: string, path: string) => ev(m, { lane: "AUTHENTICATED_HUMAN", outcome: "ALLOWED", capability: cap, path, subject: SUBJECT, latencyMs: 40 + Math.round(Math.random() * 40) });
  const agent = (m: number, cap: string, path: string, ok = true, reason = "VALID_AUTHORISATION") =>
    ev(m, { lane: "AUTHORISED_AGENT", outcome: ok ? "ALLOWED" : "REFUSED", reason, capability: cap, path, agentName: "Personal assistant", subject: SUBJECT, latencyMs: 60 + Math.round(Math.random() * 60) });
  const anon = (m: number, outcome: "REFUSED" | "THROTTLED" | "CHALLENGED", path: string) =>
    ev(m, { lane: "UNTRUSTED", outcome, reason: outcome === "REFUSED" ? "NOT_IDENTIFIED" : undefined, capability: path.startsWith("/api/") ? "view_tax_code" : undefined, path, latencyMs: outcome === "REFUSED" ? 1500 + Math.round(Math.random() * 100) : 5 });

  const rows = [
    human(1380, "view_tax_code", "/your-tax"), human(1375, "claim_job_expenses", "/claim"),
    human(900, "view_tax_code", "/your-tax"), human(300, "view_tax_code", "/your-tax"),
    agent(1200, "view_tax_code", "/api/tax-code"), agent(1199, "claim_job_expenses", "/api/job-expenses"),
    agent(700, "view_tax_code", "/api/tax-code"), agent(698, "change_refund_account", "/api/refund-account", false, "PERMISSION_MISSING"),
    agent(400, "view_tax_code", "/api/tax-code"), agent(180, "view_tax_code", "/api/tax-code", false, "AUTHORISATION_REVOKED"),
    ...Array.from({ length: 5 }, (_, i) => anon(1000 - i, "REFUSED", "/api/tax-code")),
    ...Array.from({ length: 14 }, (_, i) => anon(995 - i, "THROTTLED", "/api/tax-code")),
    ...Array.from({ length: 3 }, (_, i) => anon(500 - i, "CHALLENGED", "/your-tax")),
    ...Array.from({ length: 5 }, (_, i) => anon(240 - i, "REFUSED", "/api/tax-code")),
    ...Array.from({ length: 9 }, (_, i) => anon(235 - i, "THROTTLED", "/api/tax-code")),
  ];
  await prisma.serviceEvent.createMany({ data: rows });
}

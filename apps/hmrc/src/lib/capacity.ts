// How much any one person's authority may be used, whoever is using it: the
// person, one agent, a hundred agents, or an agent HMRC can't see at all.
// Every rule is keyed by the One Login subject, never by agent or session.
import { createHash } from "node:crypto";
import { prisma } from "./db";
import { TAX_YEAR } from "./taxpayers";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Illustrative limits, chosen to make the demo legible; not policy. */
export const RULES = {
  tax_code_views_per_hour: { limit: 60, windowMs: HOUR, label: "Tax code views per hour" },
  refund_account_changes_per_30_days: { limit: 1, windowMs: 30 * DAY, label: "Refund account changes per 30 days" },
  max_open_cases: { limit: 3, label: "Open claims and changes at once" },
  one_claim_per_tax_year: { limit: 1, label: "Working-from-home claims per tax year (more only with new evidence)" },
} as const;
export type RuleName = keyof typeof RULES;

export type Refusal = {
  reason: "CAPACITY_EXCEEDED" | "DUPLICATE_SUBMISSION" | "NEW_EVIDENCE_REQUIRED";
  rule: RuleName;
  limit: number;
  used: number;
  resetsAt: string | null;
  message: string;
};

export type Admitted = { rule: RuleName | null; limit: number | null; used: number | null; evidence: string | null };

export const fingerprint = (evidence: unknown) =>
  typeof evidence === "string" && evidence.trim() ? createHash("sha256").update(evidence.trim().toLowerCase()).digest("hex").slice(0, 32) : null;

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function rateRule(tx: Tx, subject: string, rule: "tax_code_views_per_hour" | "refund_account_changes_per_30_days", now: Date): Promise<Refusal | Admitted> {
  const { limit, windowMs } = RULES[rule];
  const window = await tx.principalUsage.findMany({
    where: { subject, rule, at: { gt: new Date(now.getTime() - windowMs) } },
    select: { at: true },
    orderBy: { at: "asc" },
  });
  if (window.length >= limit) {
    return {
      reason: "CAPACITY_EXCEEDED", rule, limit, used: window.length,
      resetsAt: new Date(window[0].at.getTime() + windowMs).toISOString(),
      message: rule === "tax_code_views_per_hour" ? "Your tax code has been looked up too many times in the last hour. Try again later." : "The refund bank account has already been changed recently.",
    };
  }
  await tx.principalUsage.create({ data: { subject, rule, at: now } });
  return { rule, limit, used: window.length + 1, evidence: null };
}

async function openCases(tx: Tx, taxpayerId: string): Promise<Refusal | null> {
  const open = await tx.claim.count({ where: { taxpayerId, status: "OPEN" } });
  const { limit } = RULES.max_open_cases;
  if (open >= limit) {
    return { reason: "CAPACITY_EXCEEDED", rule: "max_open_cases", limit, used: open, resetsAt: null, message: "You already have the maximum number of open claims and changes. Wait for one to be decided." };
  }
  return null;
}

/**
 * Admit one action against a person, then run it, with the person's lock held
 * so a swarm of concurrent requests can't race past the rules.
 */
export async function withPrincipalCapacity<T>(
  taxpayer: { id: string; oneLoginSubject: string },
  capability: string,
  body: Record<string, unknown>,
  run: (admitted: Admitted) => Promise<T>,
  now = new Date(),
): Promise<{ ok: true; admitted: Admitted; result: T } | { ok: false; refusal: Refusal }> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`principal:${taxpayer.oneLoginSubject}`}))`;
      let admitted: Admitted = { rule: null, limit: null, used: null, evidence: null };

      if (capability === "view_tax_code") {
        const r = await rateRule(tx, taxpayer.oneLoginSubject, "tax_code_views_per_hour", now);
        if ("reason" in r) return { ok: false as const, refusal: r };
        admitted = r;
      }

      if (capability === "claim_job_expenses") {
        const evidence = fingerprint(body.evidence);
        const existing = await tx.claim.findMany({ where: { taxpayerId: taxpayer.id, kind: "job_expenses", taxYear: TAX_YEAR } });
        if (existing.length > 0) {
          const { limit } = RULES.one_claim_per_tax_year;
          if (!evidence) {
            return { ok: false as const, refusal: { reason: "NEW_EVIDENCE_REQUIRED" as const, rule: "one_claim_per_tax_year" as const, limit, used: existing.length, resetsAt: null, message: "You’ve already claimed for this tax year. To claim again, include new evidence." } };
          }
          if (existing.some((c) => c.evidenceFingerprint === evidence)) {
            return { ok: false as const, refusal: { reason: "DUPLICATE_SUBMISSION" as const, rule: "one_claim_per_tax_year" as const, limit, used: existing.length, resetsAt: null, message: "This claim has already been made with the same evidence." } };
          }
        }
        const full = await openCases(tx, taxpayer.id);
        if (full) return { ok: false as const, refusal: full };
        admitted = { rule: "one_claim_per_tax_year", limit: RULES.one_claim_per_tax_year.limit, used: existing.length + 1, evidence };
      }

      if (capability === "change_refund_account") {
        const full = await openCases(tx, taxpayer.id);
        if (full) return { ok: false as const, refusal: full };
        const r = await rateRule(tx, taxpayer.oneLoginSubject, "refund_account_changes_per_30_days", now);
        if ("reason" in r) return { ok: false as const, refusal: r };
        admitted = r;
      }

      if (capability === "update_employment" || capability === "change_address") {
        const full = await openCases(tx, taxpayer.id);
        if (full) return { ok: false as const, refusal: full };
      }

      const result = await run(admitted);
      return { ok: true as const, admitted, result };
    },
    { timeout: 20_000, maxWait: 20_000 },
  );
}

export const REFUSAL_STATUS: Record<Refusal["reason"], number> = {
  CAPACITY_EXCEEDED: 429,
  DUPLICATE_SUBMISSION: 409,
  NEW_EVIDENCE_REQUIRED: 409,
};

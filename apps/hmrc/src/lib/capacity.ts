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
  claim_progress_checks_per_day: { limit: 4, windowMs: DAY, label: "Scheduled claim progress checks per day" },
  one_answer_per_query: { limit: 1, label: "Answers per HMRC question" },
  answer_confirmed_by_person: { limit: 1, label: "Answers the person has agreed before they are sent" },
} as const;
export type RuleName = keyof typeof RULES;

export type Refusal = {
  reason: "CAPACITY_EXCEEDED" | "DUPLICATE_SUBMISSION" | "NEW_EVIDENCE_REQUIRED" | "CONFIRMATION_REQUIRED" | "QUERY_NOT_FOUND" | "INVALID_REQUEST";
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

async function rateRule(tx: Tx, subject: string, rule: "tax_code_views_per_hour" | "refund_account_changes_per_30_days" | "claim_progress_checks_per_day", now: Date): Promise<Refusal | Admitted> {
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
      message: rule === "tax_code_views_per_hour" ? "Your tax code has been looked up too many times in the last hour. Try again later." : rule === "claim_progress_checks_per_day" ? "Your claim progress has been checked as often as it can be today. Try again tomorrow." : "The refund bank account has already been changed recently.",
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

      if (capability === "view_claim_status") {
        admitted = { rule: null, limit: null, used: null, evidence: null };
      }

      if (capability === "check_claim_progress") {
        const r = await rateRule(tx, taxpayer.oneLoginSubject, "claim_progress_checks_per_day", now);
        if ("reason" in r) return { ok: false as const, refusal: r };
        admitted = r;
      }

      if (capability === "respond_to_query") {
        const fail = (reason: Refusal["reason"], rule: RuleName, message: string) =>
          ({ ok: false as const, refusal: { reason, rule, limit: RULES[rule].limit, used: 0, resetsAt: null, message } });
        const answer = typeof body.answer === "string" ? body.answer.trim() : "";
        if (!answer || answer.length > 1000 || typeof body.query_id !== "string") return fail("INVALID_REQUEST", "answer_confirmed_by_person", "Send query_id and an answer of up to 1000 characters.");
        const query = await tx.claimQuery.findFirst({ where: { id: body.query_id, claim: { taxpayerId: taxpayer.id } } });
        if (!query) return fail("QUERY_NOT_FOUND", "one_answer_per_query", "HMRC has not asked this person that question.");
        if (query.status === "ANSWERED") return fail("DUPLICATE_SUBMISSION", "one_answer_per_query", "This question has already been answered.");
        if (body.confirmed_by_person !== true) return fail("CONFIRMATION_REQUIRED", "answer_confirmed_by_person", "Show the person the answer and get their agreement first, then send confirmed_by_person: true.");
        admitted = { rule: "one_answer_per_query", limit: 1, used: 1, evidence: null };
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
  CONFIRMATION_REQUIRED: 428,
  QUERY_NOT_FOUND: 404,
  INVALID_REQUEST: 400,
};

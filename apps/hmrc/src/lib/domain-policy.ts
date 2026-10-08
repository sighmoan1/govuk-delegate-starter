// What HMRC will accept, whoever asks and however fast they ask.
//
// This file is domain validation and integrity: the rules about the transaction
// itself. It never looks at request rates, callers or lanes. The same person
// gets the same answer from this file whether they act themselves, through one
// agent, through a hundred sub-agents or through an agent HMRC can't see, and
// whether the request arrives once or in a burst. Everything keyed to traffic
// (requests per minute, polling limits, load shedding) lives in throughput.ts.
//
// Every rule here is keyed by the person (One Login subject / taxpayer), never
// by agent or session, so one person and one underlying claim stay one claim.
//
// Refusals from this file are business outcomes. They use 409 or a
// domain-specific status, never 429, and carry no retry guidance: waiting does
// not change them (apart from `resetsAt` on the refund-account rule, which is a
// fact about the rule, not a throttle).
import type { prisma } from "./db";
import { TAX_YEAR } from "./taxpayers";
import { fingerprint } from "./idempotency";

export { fingerprint };

export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const DAY = 86_400_000;

/**
 * HMRC's business rules.
 *
 * `one_claim_per_tax_year` and `one_answer_per_query` are integrity rules: they
 * describe what a claim or an answer is, and they stay however the service is
 * loaded.
 *
 * `max_open_cases` and `refund_account_changes_per_30_days` are PROVISIONAL
 * demo policy. They exist so the prototype can show a business limit that
 * follows the person and is not a throughput limit: "no more than three things
 * in flight" and "can't keep changing where refunds go". The numbers are
 * illustrative, not a statement of what the law or HMRC operations require.
 * Changing or removing them is a product and legal decision for a separate
 * discussion (Decision 22 in docs/DECISIONS.md); this module only keeps them
 * apart from throughput.
 */
export const DOMAIN_RULES = {
  one_claim_per_tax_year: { limit: 1, label: "Working-from-home claims per tax year (more only with new evidence)" },
  one_answer_per_query: { limit: 1, label: "Answers per HMRC question" },
  /** PROVISIONAL demo policy, not an eligibility rule. */
  max_open_cases: { limit: 3, label: "Open claims and changes at once" },
  /** PROVISIONAL demo policy, not an eligibility rule. */
  refund_account_changes_per_30_days: { limit: 1, windowMs: 30 * DAY, label: "Refund account changes per 30 days" },
} as const;
export type DomainRule = keyof typeof DOMAIN_RULES;

/** Why HMRC would not do what was asked, as a statement about the transaction. */
export type DomainReason = "CAPACITY_EXCEEDED" | "DUPLICATE_SUBMISSION" | "NEW_EVIDENCE_REQUIRED" | "QUERY_NOT_FOUND" | "INVALID_REQUEST";

/**
 * `CAPACITY_EXCEEDED` is only ever a business refusal: the person already has
 * the most open cases the demo policy allows, or has just changed the refund
 * account. It is never a statement about traffic; that is RATE_LIMITED
 * (throughput.ts). It is 409, a conflict with the person's current state, not 429.
 */
export const DOMAIN_STATUS: Record<DomainReason, number> = {
  CAPACITY_EXCEEDED: 409,
  DUPLICATE_SUBMISSION: 409,
  NEW_EVIDENCE_REQUIRED: 409,
  QUERY_NOT_FOUND: 404,
  INVALID_REQUEST: 400,
};

export type DomainRefusal = {
  /** INVALID_REQUEST is a malformed request, not a refusal of the transaction. */
  kind: "BUSINESS_REFUSAL" | "REQUEST_ERROR";
  reason: DomainReason;
  rule: DomainRule;
  limit: number;
  used: number;
  resetsAt: string | null;
  message: string;
};

/** What was admitted, and the meter reading to show for it. Throughput rules (tax code views, progress checks) appear here too, for the response's `capacity` field. */
export type Admitted = {
  rule: DomainRule | "tax_code_views_per_hour" | "claim_progress_checks_per_day" | null;
  limit: number | null;
  used: number | null;
  evidence: string | null;
};
export const NOT_METERED: Admitted = { rule: null, limit: null, used: null, evidence: null };

const refuse = (reason: DomainReason, rule: DomainRule, used: number, message: string, resetsAt: string | null = null): { ok: false; refusal: DomainRefusal } =>
  ({ ok: false, refusal: { kind: reason === "INVALID_REQUEST" ? "REQUEST_ERROR" : "BUSINESS_REFUSAL", reason, rule, limit: DOMAIN_RULES[rule].limit, used, resetsAt, message } });

async function openCases(tx: Tx, taxpayerId: string) {
  const open = await tx.claim.count({ where: { taxpayerId, status: "OPEN" } });
  return open >= DOMAIN_RULES.max_open_cases.limit
    ? refuse("CAPACITY_EXCEEDED", "max_open_cases", open, "You already have the maximum number of open claims and changes. Wait for one to be decided.")
    : null;
}

/** Refund-account changes in the last 30 days. Recorded when admitted, so it counts what HMRC accepted, not what was attempted. */
async function refundAccountChange(tx: Tx, subject: string, now: Date): Promise<{ ok: true; admitted: Admitted } | { ok: false; refusal: DomainRefusal }> {
  const { limit, windowMs } = DOMAIN_RULES.refund_account_changes_per_30_days;
  const rule = "refund_account_changes_per_30_days";
  const window = await tx.principalUsage.findMany({
    where: { subject, rule, at: { gt: new Date(now.getTime() - windowMs) } },
    select: { at: true },
    orderBy: { at: "asc" },
  });
  if (window.length >= limit) {
    return refuse("CAPACITY_EXCEEDED", rule, window.length, "The refund bank account has already been changed recently.", new Date(window[0].at.getTime() + windowMs).toISOString());
  }
  await tx.principalUsage.create({ data: { subject, rule, at: now } });
  return { ok: true, admitted: { rule, limit, used: window.length + 1, evidence: null } };
}

/**
 * May this person do this, given the state of their claims? Call it inside the
 * person's transaction, holding their lock, so concurrent requests can't race
 * past the rules. Pure domain: no caller identity, no request rates.
 */
export async function admitDomain(
  tx: Tx,
  taxpayer: { id: string; oneLoginSubject: string },
  capability: string,
  body: Record<string, unknown>,
  now: Date,
): Promise<{ ok: true; admitted: Admitted } | { ok: false; refusal: DomainRefusal }> {
  switch (capability) {
    case "claim_job_expenses": {
      const evidence = fingerprint(body.evidence);
      const existing = await tx.claim.findMany({ where: { taxpayerId: taxpayer.id, kind: "job_expenses", taxYear: TAX_YEAR } });
      if (existing.length > 0) {
        if (!evidence) return refuse("NEW_EVIDENCE_REQUIRED", "one_claim_per_tax_year", existing.length, "You’ve already claimed for this tax year. To claim again, include new evidence.");
        if (existing.some((c) => c.evidenceFingerprint === evidence)) return refuse("DUPLICATE_SUBMISSION", "one_claim_per_tax_year", existing.length, "This claim has already been made with the same evidence.");
      }
      const full = await openCases(tx, taxpayer.id);
      if (full) return full;
      return { ok: true, admitted: { rule: "one_claim_per_tax_year", limit: DOMAIN_RULES.one_claim_per_tax_year.limit, used: existing.length + 1, evidence } };
    }
    case "change_refund_account": {
      const full = await openCases(tx, taxpayer.id);
      if (full) return full;
      return refundAccountChange(tx, taxpayer.oneLoginSubject, now);
    }
    case "respond_to_query": {
      const answer = typeof body.answer === "string" ? body.answer.trim() : "";
      if (!answer || answer.length > 1000 || typeof body.query_id !== "string") return refuse("INVALID_REQUEST", "one_answer_per_query", 0, "Send query_id and an answer of up to 1000 characters.");
      const query = await tx.claimQuery.findFirst({ where: { id: body.query_id, claim: { taxpayerId: taxpayer.id } } });
      if (!query) return refuse("QUERY_NOT_FOUND", "one_answer_per_query", 0, "HMRC has not asked this person that question.");
      if (query.status === "ANSWERED") return refuse("DUPLICATE_SUBMISSION", "one_answer_per_query", 0, "This question has already been answered.");
      return { ok: true, admitted: { rule: "one_answer_per_query", limit: 1, used: 1, evidence: null } };
    }
    case "update_employment":
    case "change_address": {
      const full = await openCases(tx, taxpayer.id);
      return full ?? { ok: true, admitted: NOT_METERED };
    }
    default:
      // view_tax_code, view_claim_status, check_claim_progress: reads have no domain rule.
      return { ok: true, admitted: NOT_METERED };
  }
}

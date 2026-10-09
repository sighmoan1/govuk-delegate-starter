// HMRC's synthetic records and the business handlers. No delegation logic here.
import { randomUUID } from "node:crypto";
import type { Taxpayer as TaxpayerRow } from "@/generated/prisma";
import { prisma } from "./db";
import type { Actor } from "./delegated-authority";
import { recordReceipt, disputedReceipts, receiptKey } from "./delegate-client";
import type { Admitted, Tx } from "./domain-policy";
import { PRINCIPAL_WINDOWS } from "./throughput";
import { extraVersionInputs, progressVersion } from "./progress-version";

export type Taxpayer = TaxpayerRow;

export const TAX_YEAR = "2026 to 2027";
export const WFH_RELIEF = "£6 a week from 6 April 2026";
export const WFH_NEW_CODE = "1288L";

/**
 * Mock only: any One Login subject is a customer, with the same synthetic
 * starting position. The real HMRC would look the person up.
 */
export async function findOrCreateTaxpayer(subject: string, email?: string) {
  // Several of a person's agents can arrive at once. Prisma's upsert isn't
  // atomic, so the loser of the race reads the row the winner created.
  return createTaxpayer(subject, email).catch(async (e) => {
    if ((e as { code?: string }).code !== "P2002") throw e;
    return prisma.taxpayer.findUniqueOrThrow({ where: { oneLoginSubject: subject } });
  });
}

function createTaxpayer(subject: string, email?: string) {
  return prisma.taxpayer.upsert({
    where: { oneLoginSubject: subject },
    update: {},
    create: {
      oneLoginSubject: subject,
      name: !email || email === "sam.taylor@example.com" || email === "test@example.com" ? "Sam Taylor" : email,
      taxCode: "1257L",
      employer: "Northwind Analytics Ltd",
      taxYear: TAX_YEAR,
    },
  });
}

const ref = (p: string) => `${p}-${randomUUID().slice(0, 8).toUpperCase()}`;
const who = (actor: Actor) =>
  actor.kind === "AGENT"
    ? { submittedBy: "AGENT" as const, agentName: actor.name, mandateId: actor.chain.mandate_id, delegationId: actor.chain.delegation_id }
    : { submittedBy: "SELF" as const };

export async function viewTaxCode(taxpayer: Taxpayer) {
  return { taxpayer: taxpayer.name, tax_year: taxpayer.taxYear, tax_code: taxpayer.taxCode, employer: taxpayer.employer, synthetic: true };
}

/** The domain rules have already admitted this claim: a first claim, or a resubmission with new evidence. */
export async function claimJobExpenses(taxpayer: Taxpayer, actor: Actor, admitted: Admitted | undefined, db: Tx, opts: { reference?: string } = {}) {
  const amendment = (admitted?.used ?? 1) > 1;
  const claim = await db.claim.create({
    data: {
      taxpayerId: taxpayer.id, reference: opts.reference ?? ref("JE"), kind: "job_expenses", taxYear: TAX_YEAR, evidenceFingerprint: admitted?.evidence ?? null,
      summary: amendment ? "Tax relief for working from home: new evidence added" : `Tax relief for working from home, ${WFH_RELIEF}`,
      newTaxCode: amendment ? null : WFH_NEW_CODE, ...who(actor),
    },
  });
  await db.taxpayer.update({ where: { id: taxpayer.id }, data: { taxCode: WFH_NEW_CODE } });
  // HMRC checks the first claim and asks one question about it.
  if (!amendment) await db.claimQuery.create({ data: { claimId: claim.id, question: HMRC_QUESTION } });
  return { claim_reference: claim.reference, expense: "Working from home", tax_year: taxpayer.taxYear, relief: WFH_RELIEF, new_tax_code: WFH_NEW_CODE, synthetic: true };
}

export const HMRC_QUESTION = "Please confirm what your employer’s working-from-home policy is, and from what date it applied to you.";

/**
 * The person can tell GOV.UK they did not agree to an answer an agent sent.
 * HMRC asks Delegate, and if so treats the answer as never given.
 * If Delegate can't say, answers are left as they are and the result says so
 * (`checked: false`): "couldn't ask" is never reported as "nobody disputed".
 */
export async function reopenDisputedAnswers(taxpayerId: string): Promise<{ checked: boolean }> {
  const answered = await prisma.claimQuery.findMany({ where: { status: "ANSWERED", answeredBy: "AGENT", receiptId: { not: null }, claim: { taxpayerId } } });
  if (answered.length === 0) return { checked: true };
  const result = await disputedReceipts(answered.map((q) => q.receiptId!));
  if (!result.ok) return { checked: false };
  for (const q of answered.filter((q) => result.disputed.includes(q.receiptId!))) {
    await prisma.claimQuery.update({
      where: { id: q.id },
      data: { status: "OPEN", answer: null, answeredAt: null, answeredBy: null, answeredByName: null, confirmedByPerson: false, mandateId: null, delegationId: null, receiptId: null, answerWithdrawn: true, answerVersion: { increment: 1 }, stateChangedAt: new Date() },
    });
  }
  return { checked: true };
}

const claimJson = (c: { reference: string; summary: string; kind: string; createdAt: Date; queries: { id: string; question: string; status: string; askedAt: Date; answer: string | null; answerWithdrawn: boolean }[] }) => {
  const open = c.queries.filter((q) => q.status === "OPEN");
  return {
    reference: c.reference, summary: c.summary, kind: c.kind, received: c.createdAt.toISOString(),
    status: open.length ? "AWAITING_YOUR_REPLY" : "BEING_REVIEWED",
    open_queries: open.map((q) => ({ query_id: q.id, question: q.question, asked: q.askedAt.toISOString(), ...(q.answerWithdrawn ? { earlier_answer_withdrawn: "The person said they did not agree to the answer sent before. Ask them again." } : {}) })),
    answered_queries: c.queries.filter((q) => q.status === "ANSWERED").length,
  };
};

/** The person's claims as they stand now, after any disputed answers have been reopened. */
async function loadClaimState(taxpayer: Taxpayer) {
  const { checked } = await reopenDisputedAnswers(taxpayer.id);
  const claims = await prisma.claim.findMany({ where: { taxpayerId: taxpayer.id }, include: { queries: true }, orderBy: { createdAt: "desc" } });
  return { checked, claims };
}

const statusBody = (taxpayer: Taxpayer, state: Awaited<ReturnType<typeof loadClaimState>>) => ({
  taxpayer: taxpayer.name, claims: state.claims.map(claimJson), synthetic: true,
  dispute_check: state.checked ? "OK" : "UNAVAILABLE",
  ...(state.checked ? {} : { dispute_check_notice: "GOV.UK Delegate could not be asked whether the person disputes any answer sent for them. Answers shown as received may still be withdrawn. Check again shortly." }),
});

/** The person's claims, each with its status and anything HMRC has asked. */
export async function claimStatus(taxpayer: Taxpayer) {
  return statusBody(taxpayer, await loadClaimState(taxpayer));
}

/**
 * Polling guidance, from the same numbers that enforce the limit (throughput.ts),
 * so the advice and the 429 cannot drift apart. Polling is the only way to
 * learn of changes: HMRC does not push, call webhooks or hold subscriptions.
 */
export function pollingGuidance() {
  const w = PRINCIPAL_WINDOWS.check_claim_progress;
  const windowSeconds = w.windowMs / 1000;
  return {
    delivery: "polling_only",
    push_or_webhooks: false,
    suggested_next_poll_seconds: Math.ceil(windowSeconds / w.limit),
    limit: { rule: w.rule, checks: w.limit, per_seconds: windowSeconds, shared_by: "the person, however many agents act for them" },
    if_limited: "429 RATE_LIMITED with a Retry-After header: wait that long and ask again. It is a limit on checks, never a decision about the claim, and nothing is lost by waiting.",
    conditional_requests: "Send the last ETag back as If-None-Match. 304 Not Modified means nothing has changed since that version; any change to a claim, question or answer gives a new ETag and the full status. A 304 still counts as a check.",
  };
}

/**
 * A scheduled check: the same status, plus what changed since the agent last looked.
 * `version` is the ETag value (progress-version.ts). It changes whenever anything in
 * the status changes and does not depend on `since`, so a caller holding it has seen this state.
 */
export async function claimProgress(taxpayer: Taxpayer, body: Record<string, unknown>) {
  const state = await loadClaimState(taxpayer);
  const since = typeof body.since === "string" ? new Date(body.since) : null;
  const changed = since && !Number.isNaN(+since)
    ? await prisma.claim.count({ where: { taxpayerId: taxpayer.id, OR: [{ createdAt: { gt: since } }, { queries: { some: { OR: [{ askedAt: { gt: since } }, { answeredAt: { gt: since } }, { stateChangedAt: { gt: since } }] } } }] } })
    : null;
  const observedAt = new Date().toISOString();
  return {
    ...statusBody(taxpayer, state),
    observed_at: observedAt,
    checked_at: observedAt, // the earlier name for observed_at
    changed_since: changed === null ? null : changed > 0,
    version: progressVersion(taxpayer.id, state.claims, state.checked, await extraVersionInputs(taxpayer.id)),
    polling: pollingGuidance(),
  };
}

/**
 * The domain rules have already checked the query is this person's, open.
 * An agent's answer is only accepted once its receipt is on the person's GOV.UK record:
 * if Delegate can't record it, this throws DelegateUnavailableError, the query stays open,
 * and the agent can retry. The receipt key is stable, so a retry never makes a second receipt.
 */
export async function answerQuery(taxpayer: Taxpayer, actor: Actor, body: Record<string, unknown>, db: Tx) {
  const answer = String(body.answer).trim().slice(0, 1000);
  const confirmedByPerson = actor.kind === "SELF" || body.confirmed_by_person === true;
  let receiptId: string | null = null;
  if (actor.kind === "AGENT") {
    const open = await db.claimQuery.findUniqueOrThrow({ where: { id: String(body.query_id) }, include: { claim: true } });
    receiptId = await recordReceipt({
      mandate_id: actor.chain.mandate_id, delegation_id: actor.chain.delegation_id, capability: "respond_to_query", reference: open.id,
      text: `To HMRC’s question “${open.question}” on claim ${open.claim.reference}: ${answer}`,
      agent_confirmed: confirmedByPerson, idempotency_key: receiptKey(open.id, open.answerVersion),
    });
  }
  const q = await db.claimQuery.update({
    where: { id: String(body.query_id) },
    data: {
      status: "ANSWERED", answer, answeredAt: new Date(), stateChangedAt: new Date(), confirmedByPerson,
      answeredBy: actor.kind === "AGENT" ? "AGENT" : "SELF",
      answeredByName: actor.kind === "AGENT" ? actor.name : null,
      mandateId: actor.kind === "AGENT" ? actor.chain.mandate_id : null,
      delegationId: actor.kind === "AGENT" ? actor.chain.delegation_id : null,
      receiptId,
    },
    include: { claim: true },
  });
  return {
    query_id: q.id, claim_reference: q.claim.reference, answered: true, status: "BEING_REVIEWED", synthetic: true,
    // Whether the person approved is the agent's say-so: HMRC has no independent evidence of it. The person can dispute the receipt.
    person_approval: actor.kind === "SELF" ? "PERSON_SUBMITTED" : confirmedByPerson ? "AGENT_ASSERTED" : "NOT_DECLARED",
    ...(receiptId ? { receipt_id: receiptId } : {}),
  };
}

export async function updateEmployment(taxpayer: Taxpayer, actor: Actor, body: Record<string, unknown>, db: Tx) {
  const summary = typeof body.details === "string" && body.details.trim() ? body.details.trim().slice(0, 200) : "Employment details updated";
  const claim = await db.claim.create({ data: { taxpayerId: taxpayer.id, reference: ref("EM"), kind: "employment_update", summary, ...who(actor) } });
  return { change_reference: claim.reference, update: summary, synthetic: true };
}

export async function changeRefundAccount(taxpayer: Taxpayer, actor: Actor, db: Tx) {
  const claim = await db.claim.create({ data: { taxpayerId: taxpayer.id, reference: ref("BA"), kind: "refund_account", summary: "Refund bank account changed (mock: no details held)", ...who(actor) } });
  return { change_reference: claim.reference, updated: true, synthetic: true };
}

export async function changeAddress(taxpayer: Taxpayer, actor: Actor, db: Tx) {
  const claim = await db.claim.create({ data: { taxpayerId: taxpayer.id, reference: ref("AD"), kind: "address", summary: "Address changed (mock: no address held)", ...who(actor) } });
  return { change_reference: claim.reference, updated: true, synthetic: true };
}

export const claimsFor = (taxpayerId: string) => prisma.claim.findMany({ where: { taxpayerId }, orderBy: { createdAt: "desc" } });

// What HMRC tells a client about a claim it has received but not yet processed
// (issue #21): the 202 receipt, the status lookup, the wording, and the work a
// worker does. Wording rule: status is about taking the claim in. Nothing here
// ever says a claim is approved, eligible or paid; COMPLETED means HMRC has
// recorded the claim and will review it.
import type { Transaction, TransactionStatus } from "@/generated/prisma";
import { prisma } from "./db";
import type { Actor } from "./delegated-authority";
import { claimJobExpenses, TAX_YEAR, type Taxpayer } from "./taxpayers";
import type { Admitted, Tx } from "./domain-policy";
import { enqueueClaim, type Processor } from "./transaction-queue";

/** The prototype's receipt time is when this mock service committed the submission. It is not evidence of when anything was legally filed. */
export const RECEIPT_NOTE =
  "The received_at time is when this prototype recorded your submission. It is not proof of a statutory filing date: how a real service would decide the legally effective time of a submission is a policy and legal question this prototype does not answer.";

export const STATUS_TEXT: Record<TransactionStatus, { heading: string; meaning: string }> = {
  QUEUED: { heading: "Received, waiting to be processed", meaning: "HMRC has safely received the claim and it is waiting its turn. Nothing has been decided." },
  PROCESSING: { heading: "Being processed", meaning: "HMRC is recording the claim now. Nothing has been decided." },
  COMPLETED: { heading: "Recorded, now being reviewed", meaning: "HMRC has recorded the claim and will review it. This is not a decision on the claim." },
  FAILED: { heading: "Could not be recorded", meaning: "HMRC could not finish recording this claim. Nothing was claimed and nothing has been decided. It can be submitted again." },
};

export const statusUrl = (id: string) => `/api/transactions/${id}`;

type View = Pick<Transaction, "id" | "status" | "receivedAt" | "completedAt" | "failedAt" | "claimReference" | "submittedBy" | "agentName" | "attempts" | "maxAttempts" | "operation">;

/**
 * The same JSON for the 202 receipt and the status lookup. The claim reference
 * is given only once the claim exists. The error that failed an attempt is for
 * operators and is never included.
 */
export function transactionJson(t: View) {
  return {
    transaction_id: t.id,
    operation: t.operation,
    status: t.status,
    status_meaning: STATUS_TEXT[t.status].meaning,
    status_url: statusUrl(t.id),
    received_at: t.receivedAt.toISOString(),
    receipt_note: RECEIPT_NOTE,
    submitted_by: t.submittedBy === "AGENT" ? { kind: "AGENT", name: t.agentName } : { kind: "SELF" },
    attempts: t.attempts,
    ...(t.status === "COMPLETED" ? { claim_reference: t.claimReference, completed_at: t.completedAt?.toISOString() ?? null } : {}),
    ...(t.status === "FAILED" ? { failed_at: t.failedAt?.toISOString() ?? null, failure: { code: "PROCESSING_FAILED", retry_with_new_request: true } } : {}),
    synthetic: true,
  };
}

/** The result stored with the idempotency record and sent as the 202 body. `accepted` is how the response layer knows to send 202 and a Location. */
export const receiptJson = (t: View) => ({ accepted: true as const, ...transactionJson(t) });

export const isReceipt = (r: unknown): r is ReturnType<typeof receiptJson> =>
  !!r && typeof r === "object" && (r as { accepted?: unknown }).accepted === true && typeof (r as { transaction_id?: unknown }).transaction_id === "string";

/** A retry is answered with the stored receipt, but with where the claim has got to now, not where it was at receipt. */
export async function freshReceipt(stored: ReturnType<typeof receiptJson>) {
  const t = await prisma.transaction.findUnique({ where: { id: stored.transaction_id } });
  return t ? receiptJson(t) : stored;
}

/** Only the person the claim is for, however they or an agent for them ask. Someone else's id is the same as no id. */
export const transactionFor = (subject: string, id: string) =>
  prisma.transaction.findFirst({ where: { id, subject } });

/** The person's claims HMRC has received but not finished, and any that failed: for their page. */
export const transactionsFor = (subject: string) =>
  prisma.transaction.findMany({ where: { subject }, orderBy: { receivedAt: "desc" }, take: 20 });

/** What the worker does for a claim: the same business function as the synchronous path, with the claim reference reserved at receipt. */
export const processClaimJob: Processor = async (job, tx) => {
  const taxpayer = await tx.taxpayer.findUniqueOrThrow({ where: { oneLoginSubject: job.subject } });
  // An earlier claim for the year (this person's items run in the order received) makes this one an amendment.
  const earlier = await tx.claim.count({ where: { taxpayerId: taxpayer.id, kind: "job_expenses", taxYear: TAX_YEAR } });
  const actor: Actor = job.submittedBy === "AGENT"
    ? { kind: "AGENT", name: job.agentName ?? "Agent", id: job.agentId ?? "", chain: { mandate_id: job.mandateId ?? "", delegation_id: job.delegationId ?? "", parent_delegation_id: null, depth: 0, label: null, assurance: "REGISTERED" } }
    : { kind: "SELF" };
  await claimJobExpenses(taxpayer, actor, { rule: "one_claim_per_tax_year", limit: 1, used: earlier + 1, evidence: job.evidenceFingerprint }, tx, { reference: job.claimReference });
};

/**
 * Receive a claim for later processing. The domain rules have admitted it (counting claims already waiting), and this
 * writes the receipt and the work item as one row in the caller's transaction, so the 202 is only ever sent for work
 * that is stored. Nothing is claimed yet: no claim, tax code change or HMRC question exists until a worker records it.
 */
export async function receiveClaim(taxpayer: Taxpayer, actor: Actor, admitted: Admitted | undefined, db: Tx, checkId: string | null) {
  const row = await enqueueClaim(db, { subject: taxpayer.oneLoginSubject, evidenceFingerprint: admitted?.evidence ?? null, actor, delegateCheckId: checkId });
  return receiptJson(row);
}

/** The status lookup. The domain rules have already checked it is this person's; a missing row here is a race with a reset. */
export async function transactionStatus(subject: string, id: string) {
  const t = await transactionFor(subject, id);
  if (!t) throw new Error("transaction vanished between admission and lookup");
  return transactionJson(t);
}

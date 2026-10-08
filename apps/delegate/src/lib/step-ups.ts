// A step-up approval is the person's yes to ONE proposed transaction (issue #19,
// Decision 23). This file holds the model: what a proposal is, how it is bound,
// what state it is in, how the person decides it. Reserving and completing it
// (what a service does when it admits and commits the operation) is in
// step-up-redeem.ts.
//
// The one rule that shapes everything here: asking about a proposal never
// changes its approval. Only the person (approve, decline), the clock (expiry)
// and the service that performs the action (reserve, complete, release) do.
import { createHash } from "node:crypto";
import type { Prisma, StepUp } from "@/generated/prisma";
import { prisma } from "./db";
import { stepUpMaxAgeMs } from "./config";
import { userCode } from "./user-code";

export type DisplayRow = { label: string; value: string };
export type ProposalInput = { idempotencyKey: string; payload: unknown };

/**
 * What a check says about the approval for the proposal it was asked about.
 * Blocked (the person has to act, or nothing may proceed):
 *   AWAITING_APPROVAL, EXPIRED (a fresh request has been opened), DECLINED,
 *   PROPOSAL_REQUIRED, PROPOSAL_INVALID, KEY_USED_FOR_OTHER_TRANSACTION.
 * Not blocked (the person approved this exact proposal; authority is sound):
 *   APPROVED     - unspent: the service may reserve it and commit.
 *   IN_PROGRESS  - another operation holds it right now.
 *   REDEEMED     - already spent: the service may only return what it stored.
 */
export type StepUpState =
  | "AWAITING_APPROVAL" | "EXPIRED" | "DECLINED" | "PROPOSAL_REQUIRED" | "PROPOSAL_INVALID" | "KEY_USED_FOR_OTHER_TRANSACTION"
  | "APPROVED" | "IN_PROGRESS" | "REDEEMED";

export type StepUpInfo = {
  state: StepUpState;
  message: string;
  proposalId?: string;
  proposalHash?: string;
  userCode?: string;
  expiresAt?: Date;
  retryAfterSeconds?: number;
  details?: DisplayRow[];
};

// ── The content of a proposal ───────────────────────────────────────────────

type Field = { key: string; label: string; required: boolean; max: number; normalise: (v: string) => string; valid: (v: string) => boolean; show?: (v: string) => string };
const digits = (v: string) => v.replace(/\D/g, "");
const text = (v: string) => v.trim().replace(/\s+/g, " ");

/** Mocked bank and address details. Nothing here is validated against a real bank or the Royal Mail. */
const CONTENT: Record<string, Field[]> = {
  change_refund_account: [
    { key: "account_name", label: "Name on the account", required: true, max: 60, normalise: text, valid: (v) => v.length > 0 },
    { key: "sort_code", label: "Sort code", required: true, max: 8, normalise: (v) => digits(v).replace(/^(\d{2})(\d{2})(\d{2})$/, "$1-$2-$3"), valid: (v) => /^\d{2}-\d{2}-\d{2}$/.test(v) },
    { key: "account_number", label: "Account number", required: true, max: 8, normalise: digits, valid: (v) => /^\d{8}$/.test(v), show: (v) => `ending ${v.slice(-4)}` },
  ],
  change_address: [
    { key: "address_line_1", label: "Address line 1", required: true, max: 80, normalise: text, valid: (v) => v.length > 0 },
    { key: "address_line_2", label: "Address line 2", required: false, max: 80, normalise: text, valid: () => true },
    { key: "town", label: "Town or city", required: true, max: 60, normalise: text, valid: (v) => v.length > 0 },
    { key: "postcode", label: "Postcode", required: true, max: 10, normalise: (v) => text(v).toUpperCase(), valid: (v) => /^[A-Z0-9][A-Z0-9 ]{2,8}[A-Z0-9]$/.test(v) },
  ],
};

export const CHANGE_HEADLINE: Record<string, string> = {
  change_refund_account: "Change the bank account your tax refunds are paid into",
  change_address: "Change the address HMRC holds for you",
};

const KEY = /^[\x21-\x7e]{1,128}$/;

const canonical = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map(canonical).join(",")}]`
  : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`
  : JSON.stringify(v ?? null);
const sha256 = (v: unknown) => createHash("sha256").update(canonical(v)).digest("hex");

export type ParsedProposal =
  | { ok: true; idempotencyKey: string; payload: Record<string, string>; payloadDigest: string; display: DisplayRow[] }
  | { ok: false; message: string };

/** Delegate normalises the content itself, so the digest and what the person sees come from the same values. */
export function parseProposal(serviceSlug: string, capability: string, input: ProposalInput): ParsedProposal {
  const fields = CONTENT[capability];
  if (!fields) return { ok: false, message: `There is no description for ${capability}, so Delegate cannot show the person what they would be approving.` };
  if (typeof input.idempotencyKey !== "string" || !KEY.test(input.idempotencyKey)) return { ok: false, message: "idempotency_key must be 1 to 128 visible characters with no spaces." };
  const raw = input.payload;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, message: "payload must be an object of the proposed details." };
  const given = raw as Record<string, unknown>;
  const unknown = Object.keys(given).filter((k) => !fields.some((f) => f.key === k));
  if (unknown.length) return { ok: false, message: `Unexpected fields: ${unknown.join(", ")}.` };
  const payload: Record<string, string> = {};
  const display: DisplayRow[] = [];
  for (const f of fields) {
    const v = given[f.key];
    if (v === undefined || v === null || v === "") {
      if (f.required) return { ok: false, message: `${f.key} is required.` };
      continue;
    }
    if (typeof v !== "string" || v.length > 200) return { ok: false, message: `${f.key} must be text.` };
    const n = f.normalise(v);
    if (n.length > f.max || !f.valid(n)) return { ok: false, message: `${f.key} is not valid.` };
    if (n === "" && !f.required) continue;
    payload[f.key] = n;
    display.push({ label: f.label, value: f.show ? f.show(n) : n });
  }
  return { ok: true, idempotencyKey: input.idempotencyKey, payload, payloadDigest: sha256({ v: 1, service: serviceSlug, capability, payload }), display };
}

/**
 * The proposal reference: a hash over everything the approval is bound to,
 * including its expiry. It is a reference, not a signature: anyone who knows the
 * fields can compute it. A production design would sign it.
 */
export function proposalHashOf(f: { mandateId: string; principalId: string; serviceId: string; capability: string; payloadDigest: string; idempotencyKey: string; expiresAt: Date }) {
  return sha256({ v: 1, mandate: f.mandateId, principal: f.principalId, service: f.serviceId, capability: f.capability, payload: f.payloadDigest, key: f.idempotencyKey, expires: f.expiresAt.toISOString() });
}

// ── State ───────────────────────────────────────────────────────────────────

export type View = "PENDING" | "APPROVED" | "IN_PROGRESS" | "REDEEMED" | "DECLINED" | "EXPIRED";

/** The state of a row at `now`. Time passing is applied here, whether or not a sweep has recorded it. */
export function viewOf(row: Pick<StepUp, "status" | "expiresAt" | "reservationExpiresAt">, now: Date): View {
  if (row.status === "USED") return "REDEEMED";
  if (row.status === "EXPIRED") return "EXPIRED";
  const proposalOver = row.expiresAt < now; // inclusive: exactly at the deadline still counts (from #41)
  if (row.status === "RESERVED" && row.reservationExpiresAt && row.reservationExpiresAt > now) return "IN_PROGRESS"; // an in-flight commit may finish after the window
  if (proposalOver) return "EXPIRED";
  if (row.status === "DECLINED") return "DECLINED";
  if (row.status === "PENDING") return "PENDING";
  return "APPROVED"; // APPROVED, or RESERVED with a lapsed lease
}

/** Record what time has done: lapsed leases go back to APPROVED, lapsed proposals become EXPIRED. */
export async function sweepStepUps(mandateId: string, now: Date) {
  await prisma.stepUp.updateMany({
    where: { mandateId, status: "RESERVED", reservationExpiresAt: { lte: now }, expiresAt: { gte: now } },
    data: { status: "APPROVED", reservationId: null, reservedAt: null, reservationExpiresAt: null },
  });
  await prisma.stepUp.updateMany({
    where: { mandateId, expiresAt: { lt: now }, OR: [{ status: { in: ["PENDING", "APPROVED", "DECLINED"] } }, { status: "RESERVED", reservationExpiresAt: { lte: now } }] },
    data: { status: "EXPIRED" },
  });
}

// ── The gate the authority check uses ───────────────────────────────────────

export type GateContext = {
  mandate: { id: string; principalId: string; serviceId: string; validUntil: Date };
  serviceSlug: string;
  capability: string;
  proposal?: ProposalInput;
};
export type Gate = { blocked: boolean; info: StepUpInfo };

const blocked = (info: StepUpInfo): Gate => ({ blocked: true, info });
const allowed = (info: StepUpInfo): Gate => ({ blocked: false, info });

/**
 * Report the approval state for the proposal. Reads, and opens a request for the
 * person to decide if there is none. It never approves, reserves or spends.
 */
export async function stepUpGate(ctx: GateContext, now: Date): Promise<Gate> {
  if (!ctx.proposal) {
    return blocked({ state: "PROPOSAL_REQUIRED", message: "This action needs the person's approval of one specific change. Send the details of the change with an Idempotency-Key." });
  }
  const parsed = parseProposal(ctx.serviceSlug, ctx.capability, ctx.proposal);
  if (!parsed.ok) return blocked({ state: "PROPOSAL_INVALID", message: parsed.message });
  const { mandate, capability } = ctx;
  await sweepStepUps(mandate.id, now);

  const rows = await prisma.stepUp.findMany({ where: { mandateId: mandate.id, capability, idempotencyKey: parsed.idempotencyKey }, orderBy: { createdAt: "desc" } });
  const same = rows.filter((r) => r.payloadDigest === parsed.payloadDigest);
  const live = same.find((r) => r.status !== "EXPIRED");
  if (live) return describe(live, ctx, now);

  // The key was already spent on something else: this is a different transaction under a used key.
  if (rows.some((r) => r.status === "USED")) {
    return blocked({ state: "KEY_USED_FOR_OTHER_TRANSACTION", message: "This Idempotency-Key was already used for a different change. Use a new key for a new change." });
  }

  const expiresAt = new Date(Math.min(now.getTime() + stepUpMaxAgeMs(), mandate.validUntil.getTime()));
  try {
    const row = await prisma.stepUp.create({
      data: {
        mandateId: mandate.id, principalId: mandate.principalId, serviceId: mandate.serviceId, capability, userCode: userCode(),
        idempotencyKey: parsed.idempotencyKey, payloadDigest: parsed.payloadDigest, display: parsed.display as unknown as Prisma.InputJsonValue, expiresAt,
        proposalHash: proposalHashOf({ mandateId: mandate.id, principalId: mandate.principalId, serviceId: mandate.serviceId, capability, payloadDigest: parsed.payloadDigest, idempotencyKey: parsed.idempotencyKey, expiresAt }),
      },
    });
    const g = await describe(row, ctx, now);
    return same.length > 0 ? blocked({ ...g.info, state: "EXPIRED", message: "The earlier approval for this change ran out. A new request is open: the person needs to approve again." }) : g;
  } catch (e) {
    if ((e as { code?: string }).code !== "P2002") throw e;
    // Another request proposed the same thing at the same moment: report on theirs.
    const raced = await prisma.stepUp.findFirst({ where: { mandateId: mandate.id, capability, idempotencyKey: parsed.idempotencyKey, payloadDigest: parsed.payloadDigest, status: { not: "EXPIRED" } } });
    if (!raced) throw e;
    return describe(raced, ctx, now);
  }
}

const retryAfter = (until: Date | null, now: Date) => (until ? Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 1000)) : undefined);

function describe(row: StepUp, ctx: GateContext, now: Date): Gate {
  const base = { proposalId: row.id, proposalHash: row.proposalHash, expiresAt: row.expiresAt, details: row.display as unknown as DisplayRow[] };
  // The reference must still be the hash of what we are being asked about; a row edited out of band does not count.
  const expected = proposalHashOf({ mandateId: ctx.mandate.id, principalId: ctx.mandate.principalId, serviceId: ctx.mandate.serviceId, capability: ctx.capability, payloadDigest: row.payloadDigest, idempotencyKey: row.idempotencyKey, expiresAt: row.expiresAt });
  if (expected !== row.proposalHash) return blocked({ ...base, state: "PROPOSAL_INVALID", message: "The stored approval does not match this request." });
  switch (viewOf(row, now)) {
    case "PENDING":
      return blocked({ ...base, state: "AWAITING_APPROVAL", userCode: row.userCode, message: "The person has to approve this exact change on GOV.UK. Give them the code." });
    case "DECLINED":
      return blocked({ ...base, state: "DECLINED", message: "The person declined this change. Do not ask again unless they ask you to; a new request needs a new Idempotency-Key." });
    case "EXPIRED":
      return blocked({ ...base, state: "EXPIRED", message: "The approval ran out before it was used. Ask again." });
    case "APPROVED":
      return allowed({ ...base, state: "APPROVED", message: "The person approved this exact change and it has not been used. It is used up only when you reserve it and report the change as committed." });
    case "IN_PROGRESS":
      return allowed({ ...base, state: "IN_PROGRESS", retryAfterSeconds: retryAfter(row.reservationExpiresAt, now), message: "Another operation is using this approval right now." });
    case "REDEEMED":
      return allowed({ ...base, state: "REDEEMED", message: "This approval was used for this change. Return what you stored for it; do not run it again." });
  }
}

// ── The person's decision ───────────────────────────────────────────────────

export type Decision = { ok: true } | { ok: false; reason: "NOT_FOUND" | "EXPIRED" | "MANDATE_ENDED" | "NOT_PENDING" };

const liveMandate = (principalId: string, now: Date) => ({ principalId, status: "ACTIVE" as const, validFrom: { lte: now }, validUntil: { gt: now } });

/** Why a code the person typed cannot be decided, in the order they would want to hear it. */
async function whyNot(code: string, principalId: string, now: Date): Promise<Extract<Decision, { ok: false }>> {
  const row = await prisma.stepUp.findUnique({ where: { userCode: code }, include: { mandate: true } });
  if (!row || row.mandate.principalId !== principalId) return { ok: false, reason: "NOT_FOUND" };
  if (!(row.mandate.status === "ACTIVE" && row.mandate.validUntil > now)) return { ok: false, reason: "MANDATE_ENDED" };
  if (viewOf(row, now) === "EXPIRED") return { ok: false, reason: "EXPIRED" };
  return { ok: false, reason: "NOT_PENDING" };
}

/**
 * Approve exactly this proposal, once, if it is still waiting, unexpired, and the
 * mandate behind it is still live. One conditional update: two clicks, or an
 * approval racing a revocation, cannot both win.
 */
export async function approveStepUp(code: string, principalId: string, now = new Date()): Promise<Decision> {
  const won = await prisma.stepUp.updateMany({
    where: { userCode: code, status: "PENDING", expiresAt: { gte: now }, mandate: liveMandate(principalId, now) },
    data: { status: "APPROVED", approvedAt: now },
  });
  return won.count === 1 ? { ok: true } : whyNot(code, principalId, now);
}

/** Decline this proposal. The row is kept, so the agent cannot simply ask again for the same thing. */
export async function declineStepUp(code: string, principalId: string, now = new Date()): Promise<Decision> {
  const won = await prisma.stepUp.updateMany({
    where: { userCode: code, status: "PENDING", expiresAt: { gte: now }, mandate: { principalId } },
    data: { status: "DECLINED", declinedAt: now },
  });
  return won.count === 1 ? { ok: true } : whyNot(code, principalId, now);
}

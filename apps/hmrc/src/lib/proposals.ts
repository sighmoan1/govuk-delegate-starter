// The content of the two HIGH-risk changes, as HMRC understands it (issue #19).
//
// Delegate asks the person to approve ONE specific change, so HMRC tells it
// exactly what it is about to make. The details are mocked: HMRC holds no bank or
// address register, validates only their shape, and does not store them (the
// handlers record that a change was made, not what it was). They exist so the
// person can see what they are approving and so a different change cannot ride on
// that approval.
import { isValidKey } from "./idempotency-key";

/** The capabilities Delegate requires the person's approval for. HMRC does not decide that; it only needs to know which ones to describe. */
export const STEP_UP_CAPABILITIES: ReadonlySet<string> = new Set(["change_refund_account", "change_address"]);

type Field = { key: string; required: boolean; max: number; normalise: (v: string) => string; valid: (v: string) => boolean };
const digits = (v: string) => v.replace(/\D/g, "");
const text = (v: string) => v.trim().replace(/\s+/g, " ");

const FIELDS: Record<string, Field[]> = {
  change_refund_account: [
    { key: "account_name", required: true, max: 60, normalise: text, valid: (v) => v.length > 0 },
    { key: "sort_code", required: true, max: 8, normalise: (v) => digits(v).replace(/^(\d{2})(\d{2})(\d{2})$/, "$1-$2-$3"), valid: (v) => /^\d{2}-\d{2}-\d{2}$/.test(v) },
    { key: "account_number", required: true, max: 8, normalise: digits, valid: (v) => /^\d{8}$/.test(v) },
  ],
  change_address: [
    { key: "address_line_1", required: true, max: 80, normalise: text, valid: (v) => v.length > 0 },
    { key: "address_line_2", required: false, max: 80, normalise: text, valid: () => true },
    { key: "town", required: true, max: 60, normalise: text, valid: (v) => v.length > 0 },
    { key: "postcode", required: true, max: 10, normalise: (v) => text(v).toUpperCase(), valid: (v) => /^[A-Z0-9][A-Z0-9 ]{2,8}[A-Z0-9]$/.test(v) },
  ],
};

/** Every field, normalised, null where absent or empty. Used for HMRC's own idempotency digest: lenient, never refuses. */
export function changeFields(capability: string, body: Record<string, unknown>): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const f of FIELDS[capability] ?? []) {
    const v = body[f.key];
    out[f.key] = typeof v === "string" && f.normalise(v) !== "" ? f.normalise(v) : null;
  }
  return out;
}

export type Proposal = { idempotency_key: string; payload: Record<string, string> };
export type ProposalResult =
  | { ok: true; proposal: Proposal }
  | { ok: false; reason: "IDEMPOTENCY_KEY_REQUIRED" | "INVALID_IDEMPOTENCY_KEY" | "INVALID_REQUEST"; message: string };

/** The proposal to send to Delegate: the client's Idempotency-Key and the validated, normalised content of the change. */
export function buildProposal(capability: string, body: Record<string, unknown>, idempotencyKey: string | null): ProposalResult {
  if (!idempotencyKey) {
    return { ok: false, reason: "IDEMPOTENCY_KEY_REQUIRED", message: "This change needs an Idempotency-Key header (1 to 128 visible characters, a fresh one for each change). The person's approval is for this one change, and the key is how a retry is recognised." };
  }
  if (!isValidKey(idempotencyKey)) {
    return { ok: false, reason: "INVALID_IDEMPOTENCY_KEY", message: "Idempotency-Key must be 1 to 128 visible characters with no spaces." };
  }
  const payload: Record<string, string> = {};
  const problems: string[] = [];
  for (const f of FIELDS[capability] ?? []) {
    const raw = body[f.key];
    if (raw === undefined || raw === null || raw === "") {
      if (f.required) problems.push(`${f.key} is required`);
      continue;
    }
    if (typeof raw !== "string" || raw.length > 200) { problems.push(`${f.key} must be text`); continue; }
    const n = f.normalise(raw);
    if (n === "" && !f.required) continue;
    if (n.length > f.max || !f.valid(n)) { problems.push(`${f.key} is not valid`); continue; }
    payload[f.key] = n;
  }
  if (problems.length) {
    return { ok: false, reason: "INVALID_REQUEST", message: `Send the details of the change, as made-up demo data: ${problems.join("; ")}. Fields: ${(FIELDS[capability] ?? []).map((f) => f.key + (f.required ? "" : " (optional)")).join(", ")}.` };
  }
  return { ok: true, proposal: { idempotency_key: idempotencyKey, payload } };
}

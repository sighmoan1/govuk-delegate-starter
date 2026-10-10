import {createHash} from "node:crypto";
import catalogue from "../../service-catalogue.json";
import { TAX_YEAR } from "./taxpayers";
import { config } from "./config";

export type DelegateChain = {
  mandate_id: string;
  delegation_id: string;
  parent_delegation_id: string | null;
  depth: number;
  label: string | null;
  assurance: "VERIFIED" | "REGISTERED" | "DECLARED";
};
type DelegateInfo = { id: string; name: string; provider: string };

/**
 * The state of the person's approval of the specific change HMRC asked about.
 * APPROVED: unspent, may be reserved. IN_PROGRESS: held by another operation.
 * REDEEMED: spent; only a stored result may be returned. The rest mean the
 * person has to act (or the request was malformed). See Delegate, Decision 24.
 */
export type StepUpState =
  | "AWAITING_APPROVAL" | "EXPIRED" | "DECLINED" | "PROPOSAL_REQUIRED" | "PROPOSAL_INVALID" | "KEY_USED_FOR_OTHER_TRANSACTION"
  | "APPROVED" | "IN_PROGRESS" | "REDEEMED";
export type StepUpReport = {
  state: StepUpState;
  message: string;
  proposal_id?: string;
  proposal_hash?: string;
  user_code?: string;
  approve_url?: string;
  expires_at?: string;
  retry_after_seconds?: number;
  details?: { label: string; value: string }[];
};
export type Proposal = { idempotency_key: string; payload: Record<string, string> };

export type DelegateCheck =
  | { authorised: true; status: "ACTIVE"; authorisation_id: string; principal_id: string; subject: string; delegate: DelegateInfo; chain: DelegateChain; check_id: string; constraints?:Record<string,Record<string,string[]>>; constraint_provenance?:{mandate_id:string;delegation_id:string;catalogue:{version:number;id:string;digest:string}|null}; step_up?: StepUpReport }
  | {
      authorised: false;
      reason: string;
      status?: string | null;
      delegate?: DelegateInfo;
      chain?: DelegateChain | null;
      step_up?: StepUpReport;
      check_id: string;
    };

/** Delegate could not be reached, or did not accept the request. Never swallowed: callers decide what to tell the person. */
export class DelegateUnavailableError extends Error {
  constructor(readonly operation: string, readonly retryable: boolean, detail: string) {
    super(`Delegate ${operation} failed: ${detail}`);
    this.name = "DelegateUnavailableError";
  }
}

const canonical=(v:unknown):string=>Array.isArray(v)?"["+v.map(canonical).join(",")+"]":v&&typeof v==="object"?"{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+canonical((v as Record<string,unknown>)[k])).join(",")+"}":JSON.stringify(v);
const supportedDigest=createHash("sha256").update(canonical(catalogue)).digest("hex");
const TIMEOUT_MS = 5_000;
const retryDelayMs = () => Number(process.env.DELEGATE_RETRY_DELAY_MS ?? 200);

/**
 * POST to Delegate with a timeout. Network errors, timeouts and 5xx are
 * retried (callers only pass retries for idempotent writes); anything below
 * 500 is returned for the caller to interpret. Out of attempts, it throws.
 */
async function post(operation: string, path: string, body: unknown, retries: number): Promise<Response> {
  let detail = "";
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, retryDelayMs() * attempt));
    try {
      const res = await fetch(`${config.delegateInternalUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-service-key": config.serviceKey },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status < 500) return res;
      detail = `status ${res.status}`;
    } catch (e) {
      detail = e instanceof Error ? e.message : String(e);
    }
  }
  throw new DelegateUnavailableError(operation, true, detail);
}

export function hmrcConstraintsPermit(constraints:Record<string,Record<string,string[]>>, capability:string, context:Record<string,unknown>):boolean {
 const entries=Object.entries(constraints);
 if(entries.length!==1 || entries[0][0]!==capability || !["view_tax_code","claim_job_expenses"].includes(capability)) return false;
 const fields=entries[0][1];
 if(!fields || Object.keys(fields).length!==1 || !Array.isArray(fields.tax_year) || !fields.tax_year.length || fields.tax_year.some(v=>typeof v!=="string" || !["2025 to 2026","2026 to 2027"].includes(v))) return false;
 // These synthetic operations act on HMRC's current tax year. Caller text cannot change that semantic target.
 return fields.tax_year.includes(TAX_YEAR) && (context.tax_year===undefined || (typeof context.tax_year==="string" && fields.tax_year.includes(context.tax_year)));
}

/**
 * The one call HMRC makes to Delegate. HMRC presents its own service
 * key; Delegate verifies the agent, the mandate, the capability and
 * assurance (it spends none of the person's business limits, which HMRC applies itself), and tells HMRC who the person is only if the answer is yes.
 * Throws DelegateUnavailableError if Delegate can't answer: that is not a "no".
 */
export async function askDelegate(input: { agent_token: string; principal_id: string; capability: string; proposal?: Proposal; constraint_context?:Record<string,unknown> }): Promise<DelegateCheck> {
  const res = await post("check", "/api/authorisations/check", { ...input, constraint_context:undefined, catalogue_version:catalogue.version, service: config.serviceSlug }, 0);
  if (!res.ok) throw new DelegateUnavailableError("check", false, `status ${res.status}`);
  const check: DelegateCheck=await res.json();
  if(check.authorised && check.constraints && Object.keys(check.constraints).length) {
    const provenance=check.constraint_provenance;
    const allowed=hmrcConstraintsPermit(check.constraints,input.capability,input.constraint_context ?? {});
    if(!allowed || !provenance || provenance.catalogue?.version!==catalogue.version || provenance.catalogue?.digest!==supportedDigest || provenance.mandate_id!==check.authorisation_id || provenance.delegation_id!==check.chain.delegation_id) return {authorised:false,reason:"MANDATE_CONSTRAINT_REFUSED",delegate:check.delegate,chain:check.chain,check_id:check.check_id};
  }
  return check;
}

export type ReserveOutcome =
  | { reserved: true }
  | { reserved: false; reason: string; state: StepUpState | null; message: string; retryAfterSeconds: number | null };

/**
 * Hold the person's approval for the one operation HMRC is about to make.
 * Delegate re-checks everything and flips the approval to RESERVED in one atomic
 * step; of any number of concurrent callers one wins. `reservation_id` is HMRC's
 * own id for this attempt, so repeating a lost request here is safe. Throws
 * DelegateUnavailableError if Delegate cannot answer: the operation must not proceed.
 */
export async function reserveStepUp(r: { agent_token: string; principal_id: string; capability: string; proposal: Proposal; reservation_id: string }): Promise<ReserveOutcome> {
  const res = await post("step-up reserve", "/api/step-ups/reserve", { ...r, catalogue_version:catalogue.version, service: config.serviceSlug }, 2);
  const body = await res.json().catch(() => null);
  if (res.ok && body?.reserved === true) return { reserved: true };
  if (res.status === 401 || !body) throw new DelegateUnavailableError("step-up reserve", false, `status ${res.status}`);
  return { reserved: false, reason: String(body.reason ?? "STEP_UP_NOT_APPROVED"), state: body.state ?? null, message: String(body.message ?? "The approval is not available."), retryAfterSeconds: typeof body.retry_after_seconds === "number" ? body.retry_after_seconds : null };
}

/**
 * Tell Delegate the change this approval covers has been made. Idempotent, so
 * it is safe to repeat: HMRC does so whenever it answers a retry from its stored
 * result. Returns false rather than throwing: the change already exists and must
 * be reported to the caller as made.
 */
export async function recordStepUpDone(c: { proposal_id: string; reference?: string | null }): Promise<boolean> {
  try {
    const res = await post("step-up done", "/api/step-ups/complete", { ...c, service: config.serviceSlug }, 2);
    return res.ok;
  } catch {
    return false;
  }
}

/** The operation was not made: give the approval back. Best effort; Delegate's lease is the backstop. */
export async function giveBackStepUp(c: { proposal_id: string; reservation_id: string }): Promise<boolean> {
  try {
    const res = await post("step-up give back", "/api/step-ups/release", { ...c, service: config.serviceSlug }, 1);
    return res.ok;
  } catch {
    return false;
  }
}

/** The stable key for one submission of one answer: service + query + submission version. */
export const receiptKey = (queryId: string, version: number) => `${config.serviceSlug}:respond_to_query:${queryId}:v${version}`;

/**
 * Tell Delegate what an agent did in the person's name, in the agent's own words, so the person can see it.
 * Returns the receipt id, or throws: an action in the person's name must not be accepted unrecorded.
 * The idempotency key makes retries safe; repeating a write returns the same receipt.
 */
export async function recordReceipt(r: { mandate_id: string; delegation_id: string; capability: string; reference: string; text: string; agent_confirmed: boolean; idempotency_key: string }): Promise<string> {
  const res = await post("receipt", "/api/receipts", { ...r, catalogue_version:catalogue.version, service: config.serviceSlug }, 2);
  if (!res.ok) throw new DelegateUnavailableError("receipt", false, `status ${res.status}`);
  const id = (await res.json().catch(() => null))?.receipt_id;
  if (typeof id !== "string" || !id) throw new DelegateUnavailableError("receipt", false, "no receipt id returned");
  return id;
}

/**
 * Which of these receipts has the person said they did not agree to?
 * `ok: false` means Delegate could not say: callers must treat that as unknown, never as "none".
 */
export async function disputedReceipts(ids: string[]): Promise<{ ok: true; disputed: string[] } | { ok: false }> {
  if (ids.length === 0) return { ok: true, disputed: [] };
  try {
    const res = await post("status", "/api/receipts/status", { ids, service: config.serviceSlug }, 1);
    if (!res.ok) return { ok: false };
    const disputed = (await res.json().catch(() => null))?.disputed;
    return Array.isArray(disputed) ? { ok: true, disputed: disputed.map(String) } : { ok: false };
  } catch {
    return { ok: false };
  }
}

/**
 * Tell Delegate what happened after it said yes to a check. Best effort:
 * a failure to report must never change what the person gets from HMRC.
 * Reporting twice is safe; Delegate keeps one row per idempotency key.
 */
export async function reportOutcome(o: { check_id: string; status: "SUBMITTED" | "ACCEPTED" | "FAILED" | "COMPLETED"; reference?: string | null; reason?: string | null; idempotency_key?: string }): Promise<boolean> {
  try {
    const res = await fetch(`${config.delegateInternalUrl}/api/outcomes`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-service-key": config.serviceKey },
      body: JSON.stringify({ ...o, service: config.serviceSlug }),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

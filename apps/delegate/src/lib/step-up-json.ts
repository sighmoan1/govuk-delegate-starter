import { config } from "./config";
import type { ProposalInput, StepUpInfo } from "./step-ups";

/** The proposal as a service sends it: { idempotency_key, payload }. Anything else is "no proposal". */
export function proposalFrom(v: unknown): ProposalInput | undefined {
  if (!v || typeof v !== "object") return undefined;
  const p = v as Record<string, unknown>;
  return { idempotencyKey: typeof p.idempotency_key === "string" ? p.idempotency_key : "", payload: p.payload };
}

/** The approval's state as a service reads it. The user code and URL appear only while the person still has to act. */
export function stepUpJson(s: StepUpInfo) {
  return {
    state: s.state,
    message: s.message,
    ...(s.proposalId ? { proposal_id: s.proposalId, proposal_hash: s.proposalHash } : {}),
    ...(s.userCode ? { user_code: s.userCode, approve_url: `${config.appUrl}/approve?code=${s.userCode}` } : {}),
    ...(s.expiresAt ? { expires_at: s.expiresAt.toISOString() } : {}),
    ...(s.retryAfterSeconds ? { retry_after_seconds: s.retryAfterSeconds } : {}),
    ...(s.details ? { details: s.details } : {}),
  };
}

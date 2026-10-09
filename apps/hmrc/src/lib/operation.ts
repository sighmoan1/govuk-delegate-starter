// Run one HMRC operation for one person: admit the request (throughput.ts),
// check the transaction is permissible (domain-policy.ts), do it, and make a
// retry safe (idempotency.ts). This file only sequences them; it holds no rule.
//
// Everything that changes state happens in one database transaction, with the
// person's lock held so a swarm of concurrent requests can't race past the
// rules: the idempotency lookup, the per-person throughput windows, the domain
// rules, the business handler (which must use the `tx` it is given, never the
// global client) and the idempotency record commit together or not at all. A
// retry of an attempt that already committed gets the stored outcome back
// (`replayed: true`) and nothing runs again.
//
// Three different answers, kept apart in `Refusal.kind`:
//   BUSINESS_REFUSAL    the transaction isn't permissible (409, 404): waiting won't change it
//   REQUEST_ERROR       the request itself is malformed (400) or misuses an Idempotency-Key (409)
//   TECHNICAL_THROTTLE  too much traffic (429 + Retry-After): the same request is fine later
//   UNAVAILABLE         HMRC can't take it right now (503 + Retry-After): the same request is fine later
import type { Prisma } from "@/generated/prisma";
import { prisma } from "./db";
import { IDEMPOTENT_CAPABILITIES, isValidKey, payloadDigest } from "./idempotency";
import { DOMAIN_STATUS, NOT_METERED, admitDomain, type Admitted, type DomainRefusal, type Tx } from "./domain-policy";
import { admitPrincipalWindow, admitRequest, costClassOf, isThrottle, type CostClass, type Operator, type ThrottleRefusal, type UnavailableRefusal } from "./throughput";

export type { Admitted, Tx };

export type RequestRefusal = {
  kind: "REQUEST_ERROR";
  reason: "IDEMPOTENCY_KEY_REUSED" | "INVALID_IDEMPOTENCY_KEY" | "IDEMPOTENCY_KEY_REQUIRED";
  rule: "idempotency_key";
  limit: number;
  used: number;
  resetsAt: null;
  message: string;
};

export type Refusal = DomainRefusal | RequestRefusal | ThrottleRefusal | UnavailableRefusal;

export const REFUSAL_STATUS: Record<string, number> = {
  ...DOMAIN_STATUS,
  IDEMPOTENCY_KEY_REUSED: 409,
  INVALID_IDEMPOTENCY_KEY: 400,
  IDEMPOTENCY_KEY_REQUIRED: 400,
  RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503,
};

export type OperationOptions = {
  now?: Date;
  /** The client's Idempotency-Key (or a website form's `form:<id>`). Honoured for the capabilities in IDEMPOTENT_CAPABILITIES. */
  idempotencyKey?: string | null;
  /** Who is sending the traffic: an agent provider or a signed-in person. Omit for pages where only the person's own limits apply. */
  operator?: Operator | null;
  /** Refuse (400) a request that carries no Idempotency-Key. For the asynchronous path, where a client must be able to retry an answer it never saw. */
  requireKey?: boolean;
};

export type OperationResult<T> =
  | { ok: true; admitted: Admitted; result: T; replayed: boolean; costClass: CostClass }
  | { ok: false; refusal: Refusal; costClass: CostClass };

const keyRefusal = (reason: RequestRefusal["reason"], used: number, message: string, limit: number): RequestRefusal =>
  ({ kind: "REQUEST_ERROR", reason, rule: "idempotency_key", limit, used, resetsAt: null, message });

export async function runOperation<T>(
  taxpayer: { id: string; oneLoginSubject: string },
  capability: string,
  body: Record<string, unknown>,
  run: (admitted: Admitted, tx: Tx) => Promise<T>,
  { now = new Date(), idempotencyKey = null, operator = null, requireKey = false }: OperationOptions = {},
): Promise<OperationResult<T>> {
  const nominalClass = costClassOf(capability);
  const keyed = idempotencyKey != null && IDEMPOTENT_CAPABILITIES.has(capability);
  if (requireKey && !keyed) {
    return { ok: false, costClass: nominalClass, refusal: keyRefusal("IDEMPOTENCY_KEY_REQUIRED", 0, "Send an Idempotency-Key header (1 to 128 visible characters) with a request to be processed later, so that a retry can never make a second claim.", 128) };
  }
  if (keyed && !isValidKey(idempotencyKey.startsWith("form:") ? idempotencyKey.slice(5) : idempotencyKey)) {
    return { ok: false, costClass: nominalClass, refusal: keyRefusal("INVALID_IDEMPOTENCY_KEY", 0, "Idempotency-Key must be 1 to 128 visible characters with no spaces.", 128) };
  }
  const digest = keyed ? payloadDigest(capability, body) : "";

  // Throughput first, and cheaply: nothing below runs for a request HMRC isn't taking.
  // A retry the stored outcome will answer is admitted as a read, not as another write.
  const replay = keyed && (await prisma.idempotencyRecord.findUnique({
    where: { subject_operation_key: { subject: taxpayer.oneLoginSubject, operation: capability, key: idempotencyKey } },
    select: { payloadDigest: true },
  }))?.payloadDigest === digest;
  const retryKey = keyed ? `${taxpayer.oneLoginSubject}:${capability}:${idempotencyKey}` : null;
  const admission = admitRequest({ capability, operator, subject: taxpayer.oneLoginSubject, replay, retryKey, now: now.getTime() });
  if (!admission.ok) return { ok: false, refusal: admission.refusal, costClass: nominalClass };
  const costClass = admission.costClass;

  const outcome = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`principal:${taxpayer.oneLoginSubject}`}))`;
      if (keyed) {
        // Holding the person's lock, so no other attempt can be between this read and its own write.
        const earlier = await tx.idempotencyRecord.findUnique({
          where: { subject_operation_key: { subject: taxpayer.oneLoginSubject, operation: capability, key: idempotencyKey } },
        });
        if (earlier) {
          if (earlier.payloadDigest !== digest) {
            return { ok: false as const, refusal: keyRefusal("IDEMPOTENCY_KEY_REUSED", 1, "This Idempotency-Key was already used for a different request. Use a new key for a new request.", 1) as Refusal };
          }
          return { ok: true as const, admitted: earlier.admitted as Admitted, result: earlier.response as T, replayed: true };
        }
      }

      // Per-person throughput windows (tax code views, progress checks): technical, never a business refusal.
      const window = await admitPrincipalWindow(tx, taxpayer.oneLoginSubject, capability, now);
      if (isThrottle(window)) return { ok: false as const, refusal: window as Refusal };

      let admitted: Admitted = window ?? NOT_METERED;
      if (!window) {
        const domain = await admitDomain(tx, taxpayer, capability, body, now);
        if (!domain.ok) return { ok: false as const, refusal: domain.refusal as Refusal };
        admitted = domain.admitted;
      }

      const result = await run(admitted, tx);
      if (keyed) {
        const r = (result ?? {}) as Record<string, unknown>;
        const reference = [r.claim_reference, r.change_reference, r.query_id].find((v) => typeof v === "string") as string | undefined;
        // The unique index is the backstop behind the lock: a second writer would fail here and roll back.
        await tx.idempotencyRecord.create({
          data: {
            subject: taxpayer.oneLoginSubject, operation: capability, key: idempotencyKey, payloadDigest: digest, reference: reference ?? null,
            response: result as Prisma.InputJsonValue, admitted: admitted as unknown as Prisma.InputJsonValue,
          },
        });
      }
      return { ok: true as const, admitted, result, replayed: false };
    },
    { timeout: 20_000, maxWait: 20_000 },
  );
  return { ...outcome, costClass: outcome.ok && outcome.replayed ? "read" : costClass };
}

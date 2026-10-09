// A version for "where this person's claims stand", used as the ETag of
// GET /api/claims/progress (issue #23).
//
// What it is. A keyed hash of everything in the person's claim state that a
// status reader could see change: each claim (reference, kind, status, summary,
// when received) and each HMRC question on it (asked, answered, answered by an
// agent and withdrawn after a dispute and reopened, how many times that has
// happened, and when the state last changed). So a reply, a dispute that
// reopens a question, a correction and a new claim each change it, and a poll
// that finds nothing new gets the same value back.
//
// What it is not. It is not a cache key for a shared cache. Responses are
// `private, no-store`; the ETag is only the application's own validator, which
// the caller sends back in If-None-Match so HMRC can answer 304 with no body.
//
// Why one person's value tells nobody anything about another's. The hash is
// keyed with a server secret and includes the person's own id, so equal claim
// state for two people gives different values, and the value reveals nothing
// about the records. It is only ever compared with the version of the person
// the request has already been authorised for (never looked up by value), so
// presenting someone else's value just fails to match and the caller gets
// their own full status.
import { createHmac } from "node:crypto";
import { config } from "./config";

/** What `claimJson` needs plus the bookkeeping fields that decide whether anything changed. */
export type VersionedClaim = {
  id: string; reference: string; kind: string; summary: string; status: string; createdAt: Date;
  queries: {
    id: string; status: string; askedAt: Date; answeredAt: Date | null; stateChangedAt: Date;
    answerVersion: number; answerWithdrawn: boolean; confirmedByPerson: boolean;
  }[];
};

/**
 * EXTENSION POINT for other status sources (for example the durable queue's
 * transaction status, issue #21). Anything that should make an agent's cached
 * progress stale when it changes registers a function returning a stable string
 * describing its current state for this person; the strings are folded into the
 * version. Nothing is registered yet: progress/status is claims only.
 */
export type VersionInput = (taxpayerId: string) => Promise<string>;
const extraInputs: VersionInput[] = [];
export const registerProgressVersionInput = (f: VersionInput) => {
  extraInputs.push(f);
  return () => { const i = extraInputs.indexOf(f); if (i >= 0) extraInputs.splice(i, 1); };
};
export const extraVersionInputs = (taxpayerId: string) => Promise.all(extraInputs.map((f) => f(taxpayerId)));

const t = (d: Date | null) => (d ? d.getTime() : 0);

export function progressVersion(taxpayerId: string, claims: VersionedClaim[], disputeCheckOk: boolean, extra: string[] = []): string {
  const state = {
    ok: disputeCheckOk,
    claims: [...claims].sort((a, b) => a.id.localeCompare(b.id)).map((c) => [
      c.id, c.reference, c.kind, c.status, c.summary, t(c.createdAt),
      [...c.queries].sort((a, b) => a.id.localeCompare(b.id)).map((q) => [q.id, q.status, t(q.askedAt), t(q.answeredAt), t(q.stateChangedAt), q.answerVersion, q.answerWithdrawn, q.confirmedByPerson]),
    ]),
    extra,
  };
  return createHmac("sha256", config.sessionSecret).update(`claim-progress-etag\0${taxpayerId}\0${JSON.stringify(state)}`).digest("hex").slice(0, 32);
}

/** The header value. Weak: two responses with the same state still differ in `observed_at`. */
export const etagOf = (version: string) => `W/"${version}"`;

/**
 * RFC 9110 If-None-Match with weak comparison: true if the caller already holds
 * this version (or sent `*`, meaning "any current representation").
 */
export function ifNoneMatchHolds(header: string | null, version: string): boolean {
  if (!header) return false;
  const value = header.trim();
  if (value === "*") return true;
  return value.split(",").some((part) => part.trim().replace(/^W\//, "") === `"${version}"`);
}

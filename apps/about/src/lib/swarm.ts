import { demoConsoleKey, urls } from "./config";

// Swarm experiments, run for real: HMRC's actual API, Delegate's actual check, a real queue and a real worker,
// all over HTTP, with fresh synthetic people each run. Every number here is MEASURED from that integration run.
// (The policy comparison in swarm-sim.ts is the opposite: simulated, seeded, labelled as such.)
//
// The point of the accounting is to keep two things apart that "requests allowed" blurs together:
//
//   technical load      what reached HMRC and what it cost: HTTP requests, Delegate authority checks, 429 and
//                       503 answers, back-end work that passed admission, how long requests took
//   service outcomes    what happened to the claims people actually wanted to make: received, queued, recorded, how long
//                       they waited and how long the worker took, and how many duplicate requests were absorbed
//
// A request that was answered is not a claim. An authorised check is not a completed claim. A throttled request is not
// a lost claim (it can be sent again). 100 requests for one claim are one claim, and 100 requests for 100 people's
// claims are 100 claims: the first is a duplicate, the second may be perfectly legitimate demand.
//
//   A   1 person  × 1 agent       × N attempts at the same claim
//   B   1 person  × N sub-agents  × 1 attempt each, same claim
//   B′  1 person  × N hidden sessions (no agent identity at all), same claim
//   C   N people  × 1 agent, one claim each
//   D   a controlled burst: N people, one operator, everything at once, each claim sent twice; a bystander arrives mid-burst
//   E   a retry storm: one accepted claim, N retries while it waits and N more after it is recorded
//   F   a status-poll flood: one accepted claim, 4N status checks and N progress checks; a bystander uses the service alongside

export type Env = { delegate: string; hmrc: string; demoKey: string };
export const defaultEnv = (): Env => ({ delegate: urls.delegateInternal, hmrc: urls.hmrcInternal, demoKey: demoConsoleKey() });

export type ScenarioId = "A" | "B" | "Bp" | "C" | "D" | "E" | "F";
export type ScenarioDef = { id: ScenarioId; name: string; short: string; setup: string; added: boolean; expect: string };

/** Put the size of the swarm into a description: "N" becomes the number, "4N" four times it. */
export const fill = (text: string, n: number) => text.replace(/(\d+)N\b/g, (_, d) => String(Number(d) * n)).replace(/\bN\b/g, String(n));
export const SCENARIOS: ScenarioDef[] = [
  { id: "A", name: "A", short: "1 person, 1 agent", setup: "1 person, 1 agent, N attempts at the same claim", added: false, expect: "One claim. The other attempts are duplicates and create nothing." },
  { id: "B", name: "B", short: "1 person, N sub-agents", setup: "1 person, N sub-agents, one attempt each", added: false, expect: "The same as A: one claim, however many agents send it." },
  { id: "Bp", name: "B′", short: "1 person, N hidden sessions", setup: "1 person, N hidden sessions, one attempt each", added: false, expect: "The same as A, with no agent identity and no authority checks." },
  { id: "C", name: "C", short: "N people, 1 agent", setup: "N people, one agent, one claim each", added: false, expect: "N claims. Each is a different person’s legitimate claim." },
  { id: "D", name: "D", short: "Burst: N people, 1 operator", setup: "Burst: N people, one operator, all at once, each claim sent twice", added: true, expect: "N claims, all kept, recorded gradually. The repeats are absorbed." },
  { id: "E", name: "E", short: "Retry storm on 1 claim", setup: "Retry storm: one accepted claim, N retries, then N more", added: true, expect: "One claim. Every retry gets the same receipt." },
  { id: "F", name: "F", short: "Status-poll flood on 1 claim", setup: "Status-poll flood: 4N status checks and up to 40 progress checks on one claim, plus a bystander", added: true, expect: "The claim is unaffected. Some checks are slowed with 429. A bystander is not." },
];

/**
 * Where a number comes from, and what shaped it.
 *   REAL        measured against the running prototype in this run
 *   DEMO_LIMIT  a result that depends on a limit chosen for the demo (illustrative, not a decided policy)
 *   SIMULATED   from the seeded model, not from running anything (swarm-sim.ts)
 */
export type Provenance = "REAL" | "DEMO_LIMIT" | "SIMULATED";

/** Demo-only limits that can shape a result, so the page can say which one did. */
export const DEMO_LIMITS = {
  one_claim: "one claim per tax year unless new evidence is sent (domain rule, provisional)",
  tax_code_hour: "60 tax-code lookups an hour per person (technical limit, illustrative)",
  read_minute: "300 status reads a minute per person (technical limit, illustrative)",
  progress: "4 scheduled progress checks a day per person, 30 a minute (technical limit, illustrative)",
} as const;

export type Op = "claim" | "view" | "status" | "progress";
export type AttemptClass = "received" | "replay" | "duplicate" | "refused" | "ok" | "throttled" | "unavailable" | "no_authority" | "failed";
export const CLASS_LABEL: Record<AttemptClass, string> = {
  received: "Claim received (202)", replay: "Retry answered with the original receipt", duplicate: "Duplicate refused, nothing created (409)",
  refused: "Refused by a business rule", ok: "Answered (200)", throttled: "Held back for traffic (429)", unavailable: "Unavailable (503)",
  no_authority: "No authority (401/403)", failed: "Failed or no answer",
};

export type Attempt = { op: Op; status: number; reason: string | null; replay: boolean; retryAfter: string | null; ms: number; agent: boolean; txId: string | null; retry: boolean; entitlementAffected: boolean | null };

export function classify(a: Pick<Attempt, "status" | "reason" | "replay">): AttemptClass {
  if (a.status === 202) return a.replay ? "replay" : "received";
  if (a.status === 200) return "ok";
  if (a.status === 429) return "throttled";
  if (a.status === 503) return "unavailable";
  if (a.status === 401 || a.status === 403) return "no_authority";
  if (a.status === 409 && (a.reason === "DUPLICATE_SUBMISSION" || a.reason === "NEW_EVIDENCE_REQUIRED")) return "duplicate";
  if (a.status === 409 || a.status === 404 || a.status === 400) return "refused";
  return "failed";
}

export type Tally = Record<AttemptClass, number>;
const emptyTally = (): Tally => ({ received: 0, replay: 0, duplicate: 0, refused: 0, ok: 0, throttled: 0, unavailable: 0, no_authority: 0, failed: 0 });

/** What the client saw. Transport attempts, by operation and by how each ended. */
export function transportOf(attempts: Attempt[]) {
  const total = emptyTally();
  const byOp: Record<Op, Tally> = { claim: emptyTally(), view: emptyTally(), status: emptyTally(), progress: emptyTally() };
  for (const a of attempts) { const c = classify(a); total[c]++; byOp[a.op][c]++; }
  const ms = attempts.map((a) => a.ms).sort((x, y) => x - y);
  return {
    attempts: attempts.length,
    /** Of those, sent again after a 429 or 503, as Retry-After said. */
    retries: attempts.filter((a) => a.retry).length,
    networkErrors: attempts.filter((a) => a.status === 0).length,
    agentNetworkErrors: attempts.filter((a) => a.agent && a.status === 0).length,
    total, byOp,
    agentAttempts: attempts.filter((a) => a.agent).length,
    /** The first few requests that ended in none of the clear answers, for the page and for debugging. */
    failures: attempts.filter((a) => classify(a) === "failed").slice(0, 5).map((a) => ({ op: a.op, status: a.status, reason: a.reason })),
    /** Distinct receipts handed out for claims: how many separate claims the answers pointed at. */
    receipts: new Set(attempts.filter((a) => a.txId && (classify(a) === "received" || classify(a) === "replay")).map((a) => a.txId)).size,
    /** 429s and 503s whose body did not say the person's entitlement was untouched. Must be 0. */
    throttleSaidEntitlementAffected: attempts.filter((a) => (a.status === 429 || a.status === 503) && a.entitlementAffected !== false).length,
    throttledWithoutRetryAfter: attempts.filter((a) => (a.status === 429 || a.status === 503) && !a.retryAfter).length,
    clientMs: { p50: ms.length ? ms[Math.floor(ms.length / 2)] : 0, p95: ms.length ? ms[Math.min(ms.length - 1, Math.ceil(ms.length * 0.95) - 1)] : 0 },
  };
}
export type Transport = ReturnType<typeof transportOf>;

type Summary = { n: number; p50: number; p95: number; max: number; total: number };
export type ServerStats = {
  events: null | {
    httpRequests: number; authorisedChecks: number; uniqueOperations: number; replays: number; businessRefusals: number; technicalThrottles: number;
    unavailable: number; invalidRequests: number; authorityRefusals: number;
    byReason: Record<string, number>; admittedWorkByCostClass: Record<string, number>; throttlesByScope: Record<string, number>; throttlesByCostClass: Record<string, number>;
    throttlesWithoutRetryAfter: number; latencyMs: Summary;
  };
  queue: {
    received: number; peopleWithAClaim: number; byStatus: Record<string, number>; claimsRecorded: number; retriedAttempts: number;
    waitMs: Summary; processingMs: Summary; receiptToRecordedMs: Summary; drainMs: number | null; openNow: number;
    watched: { subject: string; status: string; receivedAt: string; startedAt: string | null; completedAt: string | null }[];
  };
};

export type Timeline = { t: number; open: number; recorded: number }[];

export type Invariant = { id: string; ok: boolean; text: string };

export type ScenarioResult = {
  id: ScenarioId;
  actors: number;
  /** People who each wanted one claim, or for B/A/B′ the single person. */
  people: number;
  /** Unique legitimate operations the people wanted. What the attempts are measured against. */
  demanded: number;
  transport: Transport;
  server: ServerStats | null;
  timeline: Timeline;
  /** The synthetic people (Delegate principal ids) the scenario used, so a test can look them up on the Delegate side. */
  principalIds: string[];
  /** Depends on which demo limits. */
  limits: (keyof typeof DEMO_LIMITS)[];
  /** For D and F: the person who was not the cause of the load. */
  bystander?: { subject: string; ok: boolean; attempts: number; throttled: number; receivedToRecordedMs: number | null; note: string };
  invariants: Invariant[];
  ms: number;
  error?: string;
};
export type SwarmRun = { n: number; runId: string; at: string; results: ScenarioResult[] };

// ── HTTP.

async function post(base: string, path: string, headers: Record<string, string>, body: unknown) {
  const res = await fetch(`${base}${path}`, { method: "POST", cache: "no-store", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${path} failed (${res.status})`);
  return res.json();
}

type Who = { agent: boolean; headers: Record<string, string> };
const CAPS = ["view_tax_code", "claim_job_expenses", "view_claim_status", "check_claim_progress"];

async function send(env: Env, op: Op, who: Who, tag: string, o: { key?: string; txId?: string } = {}): Promise<Attempt> {
  const started = Date.now();
  const path = op === "claim" ? "/api/job-expenses" : op === "view" ? "/api/tax-code" : op === "status" ? `/api/transactions/${o.txId}` : "/api/claims/progress";
  const headers: Record<string, string> = { "content-type": "application/json", "x-run-tag": tag, ...who.headers };
  if (op === "claim") { headers.prefer = "respond-async"; if (o.key) headers["idempotency-key"] = o.key; }
  try {
    const res = await fetch(`${env.hmrc}${path}`, { method: op === "claim" ? "POST" : "GET", cache: "no-store", headers, body: op === "claim" ? "{}" : undefined });
    const text = await res.text();
    let json: { reason?: string; entitlement_affected?: boolean; result?: { transaction_id?: string } } = {};
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { op, status: res.status, reason: json.reason ?? null, replay: res.headers.get("idempotent-replayed") === "true", retryAfter: res.headers.get("retry-after"), ms: Date.now() - started, agent: who.agent, txId: json.result?.transaction_id ?? null, retry: false, entitlementAffected: typeof json.entitlement_affected === "boolean" ? json.entitlement_affected : null };
  } catch {
    return { op, status: 0, reason: "NETWORK_ERROR", replay: false, retryAfter: null, ms: Date.now() - started, agent: who.agent, txId: null, retry: false, entitlementAffected: null };
  }
}

/** The longest a well-behaved client will wait on one Retry-After. */
const RETRY_WAIT_CAP_MS = 60_000;
const MAX_TRIES = 6;

/**
 * A well-behaved client: after a lost connection, or when HMRC says 429 or 503, it waits as long as Retry-After says, then sends the same request
 * (same Idempotency-Key) again, a limited number of times. Used for requests that stand for a claim someone wants to
 * make. Redundant requests (a duplicate, a retry storm, a poll flood) do not do this: that is the point of them.
 * Every try is recorded as an attempt.
 */
export async function patient(env: Env, log: Attempt[], op: Op, who: Who, tag: string, o: { key?: string; txId?: string } = {}): Promise<Attempt> {
  for (let i = 0; ; i++) {
    const a = { ...(await send(env, op, who, tag, o)), retry: i > 0 };
    log.push(a);
    if ((a.status !== 0 && a.status !== 429 && a.status !== 503) || i + 1 >= MAX_TRIES) return a;
    const asked = Number(a.retryAfter);
    await sleep(Math.min(RETRY_WAIT_CAP_MS, (Number.isFinite(asked) && asked > 0 ? asked : 1) * 1000) + Math.floor(Math.random() * 250));
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Run tasks with at most `limit` in flight. */
async function pool<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const out: T[] = new Array(tasks.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) { const i = next++; out[i] = await tasks[i](); }
  }));
  return out;
}

async function people(env: Env, n: number) {
  const out: { principal_id: string; subject: string }[] = [];
  let token = "";
  for (let left = n; left > 0; left -= 200) {
    const r = (await post(env.delegate, "/api/demo/principals", { "x-demo-key": env.demoKey }, { n: Math.min(left, 200), capabilities: CAPS })) as { people: typeof out; agent_token: string };
    out.push(...r.people);
    token = r.agent_token;
  }
  return { people: out, agentToken: token };
}

const asAgent = (token: string, principalId: string): Who => ({ agent: true, headers: { authorization: `Bearer ${token}`, "x-principal-id": principalId } });

async function stats(env: Env, tag: string, subjects: string[], o: { events?: boolean; watch?: string[] } = {}): Promise<ServerStats> {
  const r = await post(env.hmrc, "/api/demo/run-stats", { "x-demo-key": env.demoKey }, { run_tag_prefix: tag, subjects, include_events: o.events ?? true, watch: o.watch ?? [] });
  return r as ServerStats;
}

/** Samples the queue while a scenario runs and until it empties. */
function sampler(env: Env, tag: string, subjects: string[]) {
  const t0 = Date.now();
  const samples: Timeline = [];
  let stop = false;
  const loop = (async () => {
    while (!stop) {
      try {
        const s = await stats(env, tag, subjects, { events: false });
        samples.push({ t: Date.now() - t0, open: s.queue.openNow, recorded: s.queue.byStatus.COMPLETED ?? 0 });
      } catch { /* sampling is best effort */ }
      await sleep(200);
    }
  })();
  return { async finish(deadlineMs: number) {
    // Wait for everything received to be recorded (or failed), or give up at the deadline. The result says which.
    const until = Date.now() + deadlineMs;
    for (;;) {
      const s = await stats(env, tag, subjects, { events: false });
      if (s.queue.openNow === 0 && s.queue.received > 0) break;
      if (Date.now() > until) break;
      await sleep(250);
    }
    stop = true;
    await loop;
    return samples;
  } };
}

// ── The experiments.

/** How many requests of the poll flood are in flight at once. Below HMRC's database connection pool; see the note in scenario F. */
export const FLOOD_IN_FLIGHT = 4;
/** Scheduled progress checks in the flood. Enough to pass the per-minute and per-day limits; they run one at a time, so more only makes the run slower. */
export const PROGRESS_CHECKS = 40;

export type RunOptions = { n: number; only?: ScenarioId[]; drainDeadlineMs?: number };

export async function runExperiments(env: Env, opts: RunOptions): Promise<SwarmRun> {
  const n = opts.n;
  const runId = Date.now().toString(36);
  const want = new Set<ScenarioId>(opts.only ?? SCENARIOS.map((s) => s.id));
  const deadline = opts.drainDeadlineMs ?? 90_000;

  // Fresh synthetic people each run, so a run can be repeated without a reset and never touches anyone else's state.
  // A, B, B′ one each; warm-up; C and D n each; D's bystander; E's person; F's person and bystander.
  const total = 4 + n + n + 1 + 1 + 2;
  const { people: all, agentToken } = await people(env, total);
  const take = (k: number) => all.splice(0, k);
  const [pa] = take(1), [pb] = take(1), [pbp] = take(1), [pw] = take(1);
  const pc = take(n), pd = take(n), [pdBy] = take(1), [pe] = take(1), [pf, pfBy] = take(2);
  const key = { "x-demo-key": env.demoKey };

  const cookie = async (subject: string): Promise<Who> => ({ agent: false, headers: { cookie: ((await post(env.hmrc, "/api/demo/session", key, { subject })) as { cookie: string }).cookie } });

  // In dev, Next compiles each route on its first request. Warm them all up first, so the runs measure the rules, not the compiler.
  const warm = asAgent(agentToken, pw.principal_id);
  const wt = `swarm-${runId}-warm`;
  await send(env, "view", warm, wt);
  const w = await send(env, "claim", warm, wt, { key: `${runId}-warm` });
  await send(env, "progress", warm, wt);
  if (w.txId) await send(env, "status", warm, wt, { txId: w.txId });
  await stats(env, wt, [pw.subject]);
  // The bystander in D signs in with a session, so warm that path too.
  await send(env, "claim", await cookie(pw.subject), wt, { key: `${runId}-warm-session` });
  await sleep(300);

  const results: ScenarioResult[] = [];
  for (const def of SCENARIOS) {
    if (!want.has(def.id)) continue;
    const tag = `swarm-${runId}-${def.id}`;
    const started = Date.now();
    try {
      results.push(await runOne(def.id, tag, started));
    } catch (e) {
      results.push({ id: def.id, actors: 0, people: 0, demanded: 0, transport: transportOf([]), server: null, timeline: [], principalIds: [], limits: [], invariants: [], ms: Date.now() - started, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { n, runId, at: new Date().toISOString(), results };

  async function runOne(id: ScenarioId, tag: string, started: number): Promise<ScenarioResult> {
    const k = (i: number | string) => `${tag}-${i}`;
    const attempts: Attempt[] = [];
    const rec = async (p: Promise<Attempt>) => { const a = await p; attempts.push(a); return a; };
    let subjects: string[] = [];
    let principalIds: string[] = [];
    let demanded = 0, actors = 0, peopleCount = 0;
    let limits: ScenarioResult["limits"] = [];
    let bystander: ScenarioResult["bystander"];
    let watch: string[] = [];
    let during: ReturnType<typeof sampler>;

    // Each person wants one claim and one tax-code lookup, shared out among the actors. The lookups are technical load
    // only: they change nothing and are never counted as a service outcome. `patientClaims` says whether a claim
    // attempt stands for something someone wants (retries on 429 and 503) or is a redundant copy (it does not).
    const claimAndLook = (whoFor: (i: number) => Who, count: number, claimKey: (i: number) => string, patientClaims: boolean) => {
      const tasks: (() => Promise<unknown>)[] = [];
      for (let i = 0; i < count; i++) {
        tasks.push(() => (patientClaims ? patient(env, attempts, "claim", whoFor(i), tag, { key: claimKey(i) }) : rec(send(env, "claim", whoFor(i), tag, { key: claimKey(i) }))));
        tasks.push(() => rec(send(env, "view", whoFor(i), tag)));
      }
      return pool(tasks, 25);
    };

    if (id === "A" || id === "B" || id === "Bp") {
      const person = id === "A" ? pa : id === "B" ? pb : pbp;
      subjects = [person.subject]; principalIds = [person.principal_id]; demanded = 1; peopleCount = 1; limits = ["one_claim", "tax_code_hour"];
      let actorsList: Who[];
      if (id === "A") actorsList = [asAgent(agentToken, person.principal_id)];
      else if (id === "B") {
        actorsList = await Promise.all(Array.from({ length: n }, async (_, i) => {
          const r = await post(env.delegate, "/api/delegations", { authorization: `Bearer ${agentToken}` }, { principal_id: person.principal_id, service: "hmrc-personal-tax", capabilities: CAPS, label: `worker ${i + 1}` });
          return asAgent(r.token as string, person.principal_id);
        }));
      } else actorsList = await Promise.all(Array.from({ length: n }, () => cookie(person.subject)));
      actors = actorsList.length;
      during = sampler(env, tag, subjects);
      // N copies of the same wish. None of them retries: a 429 on a duplicate is not a claim lost.
      await claimAndLook((i) => actorsList[i % actorsList.length], n, (i) => k(i), false);
    } else if (id === "C") {
      subjects = pc.map((p) => p.subject); principalIds = pc.map((p) => p.principal_id); demanded = n; peopleCount = n; actors = 1; limits = ["one_claim", "tax_code_hour"];
      const who = pc.map((p) => asAgent(agentToken, p.principal_id));
      during = sampler(env, tag, subjects);
      await claimAndLook((i) => who[i], n, (i) => k(i), true);
    } else if (id === "D") {
      // Everything at once, each claim sent twice with the same key (a client retry). A bystander signs in
      // themselves and submits their own claim while the queue is loaded. Every claim is a wish, so every send is patient.
      subjects = [...pd.map((p) => p.subject), pdBy.subject]; principalIds = [...pd.map((p) => p.principal_id), pdBy.principal_id]; demanded = n + 1; peopleCount = n + 1; actors = 1; limits = ["one_claim"]; watch = [pdBy.subject];
      const who = pd.map((p) => asAgent(agentToken, p.principal_id));
      during = sampler(env, tag, subjects);
      const bystanderWho = await cookie(pdBy.subject);
      const burst = who.flatMap((w, i) => [patient(env, attempts, "claim", w, tag, { key: k(i) }), patient(env, attempts, "claim", w, tag, { key: k(i) })]);
      const late = (async () => { await sleep(100); return patient(env, attempts, "claim", bystanderWho, tag, { key: k("by") }); })();
      const [by] = await Promise.all([late, ...burst]);
      bystander = { subject: pdBy.subject, ok: classify(by) === "received", attempts: attempts.filter((a) => !a.agent).length, throttled: attempts.filter((a) => !a.agent && a.status === 429).length, receivedToRecordedMs: null, note: "" };
    } else if (id === "E") {
      subjects = [pe.subject]; principalIds = [pe.principal_id]; demanded = 1; peopleCount = 1; actors = 1; limits = ["read_minute"];
      const who = asAgent(agentToken, pe.principal_id);
      during = sampler(env, tag, subjects);
      await patient(env, attempts, "claim", who, tag, { key: k("claim") });
      // The storm while the claim waits, then the same storm against a finished claim.
      await Promise.all(Array.from({ length: n }, () => rec(send(env, "claim", who, tag, { key: k("claim") }))));
      await during.finish(deadline);
      await Promise.all(Array.from({ length: n }, () => rec(send(env, "claim", who, tag, { key: k("claim") }))));
    } else {
      // F: a poll flood on one person's accepted claim, with another person using the service at the same time.
      subjects = [pf.subject, pfBy.subject]; principalIds = [pf.principal_id, pfBy.principal_id]; demanded = 2; peopleCount = 2; actors = 1; limits = ["read_minute", "progress"];
      watch = [pfBy.subject];
      const victim = asAgent(agentToken, pf.principal_id);
      const other = asAgent(agentToken, pfBy.principal_id);
      during = sampler(env, tag, subjects);
      const c1 = await patient(env, attempts, "claim", victim, tag, { key: k("victim") });
      const c2 = await patient(env, attempts, "claim", other, tag, { key: k("other") });
      const victimTx = c1.txId, otherTx = c2.txId;
      if (!victimTx || !otherTx) throw new Error("the two claims for the poll flood were not received");
      // The flood: 4N status checks and N progress checks on the one claim. The bystander checks their own claim
      // alongside, and the flooder also tries the bystander's id and must get nothing.
      //
      // Bounded: at most FLOOD_IN_FLIGHT status requests at once, and progress checks one at a time. That is a limit of
      // this experiment, not of the world. HMRC's status check used to ask the pool for a second database connection
      // while it held one (fixed with this change); progress reads now also reuse the request connection (integration of #63 with #61).
      // This workload retains its original sequential progress polls; the regression tests cover concurrent polls.
      const statusTasks: { who: "flood" | "own" | "snoop"; run: () => Promise<Attempt> }[] = [];
      for (let i = 0; i < n * 4; i++) statusTasks.push({ who: "flood", run: () => send(env, "status", victim, tag, { txId: victimTx }) });
      const extras: typeof statusTasks = [
        ...Array.from({ length: 20 }, () => ({ who: "own" as const, run: () => send(env, "status", other, tag, { txId: otherTx }) })),
        ...Array.from({ length: 5 }, () => ({ who: "snoop" as const, run: () => send(env, "status", victim, tag, { txId: otherTx }) })),
      ];
      // Spread the bystander's requests evenly through the flood rather than before or after it.
      const mixed: typeof statusTasks = [];
      const every = Math.max(1, Math.floor(statusTasks.length / extras.length));
      statusTasks.forEach((x, i) => { mixed.push(x); if ((i + 1) % every === 0 && extras.length) mixed.push(extras.shift()!); });
      mixed.push(...extras);
      const progressTasks = Array.from({ length: Math.min(n, PROGRESS_CHECKS) }, () => async () => ({ who: "flood" as const, a: await send(env, "progress", victim, tag) }));
      const [statusDone, progressDone] = await Promise.all([
        pool(mixed.map((x) => async () => ({ who: x.who, a: await x.run() })), FLOOD_IN_FLIGHT),
        pool(progressTasks, 1),
      ]);
      const done = [...statusDone, ...progressDone];
      for (const d of done) attempts.push(d.a);
      const ownRes = done.filter((d) => d.who === "own").map((d) => d.a);
      const snoopRes = done.filter((d) => d.who === "snoop").map((d) => d.a);
      const ownOk = ownRes.filter((a) => classify(a) === "ok").length;
      // The flooder must never be shown the bystander's claim. Its answer is "not found", or "slow down" if its own budget is spent.
      const notFound = snoopRes.filter((a) => a.status === 404).length;
      const nothing = snoopRes.filter((a) => a.status === 404 || a.status === 429).length;
      bystander = {
        subject: pfBy.subject, ok: ownOk === ownRes.length && nothing === snoopRes.length, attempts: ownRes.length + snoopRes.length + 1,
        throttled: ownRes.filter((a) => classify(a) === "throttled").length, receivedToRecordedMs: null,
        note: `${ownOk} of ${ownRes.length} of the bystander’s own status checks were answered; the flooder’s ${snoopRes.length} attempts to read the bystander’s claim got nothing: ${notFound} “not found”, ${nothing - notFound} held back for traffic.`,
      };
    }

    const timeline = await during!.finish(deadline);
    const server = await stats(env, tag, subjects, { watch });
    const w0 = server.queue.watched.find((x) => x.subject === bystander?.subject);
    if (bystander && w0?.completedAt) bystander.receivedToRecordedMs = new Date(w0.completedAt).getTime() - new Date(w0.receivedAt).getTime();
    if (bystander && id === "D") {
      const peak = Math.max(0, ...timeline.map((s) => s.open));
      bystander.note = bystander.receivedToRecordedMs === null
        ? "The bystander’s claim was not recorded in time."
        : `The bystander’s claim was recorded ${bystander.receivedToRecordedMs} ms after receipt, with up to ${peak} claims waiting.`;
    }
    const transport = transportOf(attempts);
    return { id, actors, people: peopleCount, demanded, transport, server, timeline, principalIds, limits, bystander, invariants: invariantsOf(id, demanded, transport, server, bystander), ms: Date.now() - started };
  }
}

/**
 * The claims the experiment is built to check. Each is a plain statement with a pass or fail; the tests assert the
 * same list, and the page shows it, so a failure cannot be missed by reading only a headline.
 */
export function invariantsOf(id: ScenarioId, demanded: number, t: Transport, s: ServerStats, bystander?: ScenarioResult["bystander"]): Invariant[] {
  const q = s.queue, e = s.events!;
  const completed = q.byStatus.COMPLETED ?? 0;
  const list: Invariant[] = [
    { id: "never_more_than_wanted", ok: q.received <= demanded && q.claimsRecorded <= demanded, text: `Claims created (${q.received} received, ${q.claimsRecorded} recorded) never exceed the claims people wanted (${demanded}).` },
    { id: "one_per_person", ok: q.received === q.peopleWithAClaim, text: `No person has more than one claim: ${q.received} received for ${q.peopleWithAClaim} people.` },
    { id: "all_wanted_received", ok: q.received === demanded, text: `Every claim someone wanted was received: ${q.received} of ${demanded}. A 429 on a claim is a request to try later, not a loss.` },
    { id: "all_recorded", ok: completed === q.received && q.openNow === 0 && (q.byStatus.FAILED ?? 0) === 0, text: `Everything received was recorded: ${completed} of ${q.received}, ${q.openNow} still waiting, ${q.byStatus.FAILED ?? 0} failed.` },
    { id: "log_matches_client", ok: e.httpRequests >= t.attempts - t.networkErrors && e.httpRequests <= t.attempts, text: `HMRC’s own log counted ${e.httpRequests} requests; the client attempted ${t.attempts}, including ${t.networkErrors} lost connections whose arrival is unknown.` },
    { id: "checks_are_not_claims", ok: e.authorisedChecks >= t.agentAttempts - t.agentNetworkErrors - e.authorityRefusals && e.authorisedChecks <= t.agentAttempts - e.authorityRefusals, text: `Delegate authorised ${e.authorisedChecks} of ${t.agentAttempts} agent requests. That is a count of checks, and it is a different number from the ${q.received} claims.` },
    { id: "receipts_match_claims", ok: t.byOp.claim.received + t.byOp.claim.replay === 0 || t.receipts === q.received, text: `The receipts handed out point at ${t.receipts} claim${t.receipts === 1 ? "" : "s"}; HMRC holds ${q.received}. A repeat gets the original receipt, never a new one.` },
    { id: "throttle_not_entitlement", ok: t.throttleSaidEntitlementAffected === 0, text: "Every 429 and 503 said the person’s entitlement was not affected, and changed nothing." },
    { id: "429_say_when", ok: t.throttledWithoutRetryAfter === 0 && e.throttlesWithoutRetryAfter === 0, text: "Every 429 and 503 carried a Retry-After." },
  ];
  if (id === "A" || id === "B" || id === "Bp") list.push({ id: "duplicates_absorbed", ok: q.received === 1 && t.byOp.claim.received === 1, text: `${t.byOp.claim.duplicate} duplicate attempts at the same claim were refused with nothing created; one claim was received.` });
  if (id === "Bp") list.push({ id: "hidden_no_checks", ok: e.authorisedChecks === 0, text: "Hidden sessions used no agent credential, so Delegate was asked nothing." });
  if (id === "D") list.push({ id: "retries_absorbed", ok: t.byOp.claim.replay >= demanded - 1, text: `Each person’s second send was answered with the original receipt: ${t.byOp.claim.replay} replays, ${demanded - 1} expected (the bystander sent once).` });
  if (id === "E") list.push({ id: "storm_one_claim", ok: q.received === 1 && t.byOp.claim.received === 1 && t.byOp.claim.replay + t.byOp.claim.throttled === t.attempts - 1, text: `${t.attempts} requests for one claim made ${q.received} claim; ${t.byOp.claim.replay} were answered with the original receipt and ${t.byOp.claim.throttled} held back for traffic.` });
  if (id === "F" && bystander) list.push({ id: "bystander_unaffected", ok: bystander.ok && bystander.throttled === 0, text: bystander.note });
  return list;
}

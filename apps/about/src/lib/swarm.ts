import { demoConsoleKey, urls } from "./config";

// Scenario 5: can a swarm beat the system? The same workload, run four ways,
// through HMRC's real API and GOV.UK Delegate. Everything goes over HTTP.
//
//   A   1 person × 1 agent, doing all of it
//   B   1 person × N sub-agents, each doing a share (N delegations under one mandate)
//   B′  1 person × N undetected sessions: her own session, cloned. No agent identity at all.
//   C   N people × 1 agent each
//
// Workload: N claim attempts and N tax-code views, split evenly among the actors.

export type ArmId = "A" | "B" | "Bp" | "C";
export const ARMS: { id: ArmId; name: string; setup: string }[] = [
  { id: "A", name: "A", setup: "1 person, 1 agent" },
  { id: "B", name: "B", setup: "1 person, N agents" },
  { id: "Bp", name: "B′", setup: "1 person, N hidden sessions" },
  { id: "C", name: "C", setup: "N people, 1 agent each" },
];

/** What happened to each request, in the four groups the charts draw. */
export const BUCKETS = [
  { id: "accepted", label: "Accepted" },
  { id: "capacity", label: "Refused: person’s limit reached" },
  { id: "evidence", label: "Refused: duplicate, or needs new evidence" },
  { id: "other", label: "Refused: other, or failed" },
] as const;
export type BucketId = (typeof BUCKETS)[number]["id"];

export type Counts = Record<BucketId, number> & { raw: Record<string, number> };
export type ArmResult = { arm: ArmId; actors: number; claims: Counts; views: Counts; ms: number };
export type SwarmRun = { n: number; arms: ArmResult[]; at: string };

type Outcome = { status: number; reason: string | null };
type Who = { headers: Record<string, string> };

const bucket = (o: Outcome): BucketId =>
  o.status === 200 ? "accepted"
  : o.reason === "CAPACITY_EXCEEDED" ? "capacity"
  : o.reason === "NEW_EVIDENCE_REQUIRED" || o.reason === "DUPLICATE_SUBMISSION" ? "evidence"
  : "other";

const empty = (): Counts => ({ accepted: 0, capacity: 0, evidence: 0, other: 0, raw: {} });
function add(c: Counts, o: Outcome) {
  c[bucket(o)]++;
  const k = o.status === 200 ? "ACCEPTED" : o.reason ?? `HTTP ${o.status}`;
  c.raw[k] = (c.raw[k] ?? 0) + 1;
}

async function hmrc(path: string, method: "GET" | "POST", who: Who, runTag: string): Promise<Outcome> {
  try {
    const res = await fetch(`${urls.hmrcInternal}${path}`, {
      method, cache: "no-store",
      headers: { "content-type": "application/json", "x-run-tag": runTag, ...who.headers },
      body: method === "POST" ? "{}" : undefined,
    });
    const text = await res.text();
    let reason: string | null = null;
    try { reason = JSON.parse(text).reason ?? null; } catch { /* not JSON */ }
    return { status: res.status, reason };
  } catch {
    return { status: 0, reason: "NETWORK_ERROR" };
  }
}

async function post(base: string, path: string, headers: Record<string, string>, body: unknown) {
  const res = await fetch(`${base}${path}`, { method: "POST", cache: "no-store", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${path} failed (${res.status})`);
  return res.json();
}

/** Run tasks with at most `limit` in flight. */
async function pool<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const out: T[] = new Array(tasks.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) { const i = next++; out[i] = await tasks[i](); }
  }));
  return out;
}

export async function runSwarm(n: number): Promise<SwarmRun> {
  const key = { "x-demo-key": demoConsoleKey() };
  const caps = ["view_tax_code", "claim_job_expenses"];
  const runId = Date.now().toString(36);

  // Fresh synthetic people each run: one each for A, B and B′, a throwaway for the warm-up, and N for C.
  const { people, agent_token: agentToken } = (await post(urls.delegateInternal, "/api/demo/principals", key, { n: n + 4, capabilities: caps })) as {
    people: { principal_id: string; subject: string }[]; agent_token: string;
  };
  const [pa, pb, pbp, pw, ...pc] = people;
  const asAgent = (token: string, principalId: string): Who => ({ headers: { authorization: `Bearer ${token}`, "x-principal-id": principalId } });

  const subAgents = await Promise.all(Array.from({ length: n }, async (_, i) => {
    const r = await post(urls.delegateInternal, "/api/delegations", { authorization: `Bearer ${agentToken}` }, { principal_id: pb.principal_id, service: "hmrc-personal-tax", capabilities: caps, label: `worker ${i + 1}` });
    return asAgent(r.token as string, pb.principal_id);
  }));
  const sessions = await Promise.all(Array.from({ length: n }, async () => {
    const r = await post(urls.hmrcInternal, "/api/demo/session", key, { subject: pbp.subject });
    return { headers: { cookie: r.cookie as string } } as Who;
  }));

  const actors: Record<ArmId, Who[]> = {
    A: [asAgent(agentToken, pa.principal_id)],
    B: subAgents,
    Bp: sessions,
    C: pc.map((p) => asAgent(agentToken, p.principal_id)),
  };

  // In dev, Next compiles each route on its first request. Warm them up first,
  // so the bursts measure the rules, not the compiler.
  const warm = asAgent(agentToken, pw.principal_id); // its own person, so it can't spend any arm's claim
  await hmrc("/api/tax-code", "GET", warm, `swarm-${runId}-warm`);
  await hmrc("/api/job-expenses", "POST", warm, `swarm-${runId}-warm`);

  const arms: ArmResult[] = [];
  for (const { id } of ARMS) {
    const who = actors[id];
    const tag = `swarm-${runId}-${id}`;
    const started = Date.now();
    // Interleave the claims and views, spread evenly across the actors.
    const tasks: (() => Promise<{ kind: "claims" | "views"; o: Outcome }>)[] = [];
    for (let i = 0; i < n; i++) {
      const w = who[i % who.length];
      tasks.push(async () => ({ kind: "claims", o: await hmrc("/api/job-expenses", "POST", w, tag) }));
      tasks.push(async () => ({ kind: "views", o: await hmrc("/api/tax-code", "GET", w, tag) }));
    }
    const results = await pool(tasks, 25);
    const r: ArmResult = { arm: id, actors: who.length, claims: empty(), views: empty(), ms: Date.now() - started };
    for (const x of results) add(x.kind === "claims" ? r.claims : r.views, x.o);
    arms.push(r);
  }
  return { n, arms, at: new Date().toISOString() };
}

/** The same outcome mix, for comparing arms. */
export const shape = (c: Counts) => `${c.accepted}/${c.capacity}/${c.evidence}/${c.other}`;

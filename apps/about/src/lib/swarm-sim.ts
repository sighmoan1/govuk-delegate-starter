// SIMULATED, not measured. A deterministic, seeded model that compares ways of protecting a service from bursts of
// traffic while keeping legitimate demand: an agent-level throttle, a person-level technical throttle, and fair
// scheduling of the work. Nothing here talks to HMRC or Delegate; the same seed always gives the same table.
//
// What it is for: showing that "fewer allowed requests" and "less harm" are different questions, and what each policy
// costs the people who were doing nothing wrong. What it is not: evidence of how a real service behaves. Every number
// below depends on the assumptions in `ASSUMPTIONS`; change them and the table changes. Results measured against the
// running prototype are in swarm.ts and are labelled differently.
//
// Held the same for every policy (it is HMRC's real behaviour from issues #18 and #21, not a policy under test):
//   - a retry carrying a key HMRC already holds is answered from the stored outcome and does no new work;
//   - a second claim for something already received is refused as a duplicate and creates nothing;
//   - authority is checked with Delegate before any traffic limit, because the limit needs to know who is asking;
//   - clients that are doing legitimate work honour Retry-After and try again, a limited number of times.
// What differs: whether and where a request is turned away with 429, and in what order the queue is worked.

export const SIM_SEED = 20261009;

export const ASSUMPTIONS = {
  /** Claims HMRC records at the same time. */
  workers: 2,
  /** Time to record one claim, uniform between these (ms). Illustrative; the real worker's times are measured in the integration runs. */
  serviceMs: [300, 700] as const,
  /** How many times a legitimate client retries after a 429 before it gives up. */
  maxRetries: 6,
  /** Seconds between a legitimate client's status checks on its own claim. */
  pollEveryS: 2,
  /** The simulation stops here. A claim not recorded by then counts as not completed. */
  horizonS: 300,
  /** Fixed one-minute windows, like HMRC's in-memory counters. */
  windowS: 60,
  /** HMRC's actual per-person defaults (throughput.ts), used for the person-level policies. */
  personPerMinute: { write: 60, read: 300 },
} as const;

export type WorkloadId = "retry_storm" | "distinct_burst" | "poll_flood" | "heavy_person";
export type PolicyId = "none" | "agent_60" | "agent_600" | "person_throttle" | "fair_person" | "fair_provider" | "as_built";
type Discipline = "fifo" | "person" | "provider";

export const WORKLOADS: { id: WorkloadId; name: string; story: string; hypothetical?: string }[] = [
  { id: "retry_storm", name: "Retry storm", story: "One person’s claim is accepted. A hundred copies of the same request (the same Idempotency-Key) then arrive within three seconds. Twenty other people are claiming through the same agent at the same time." },
  { id: "distinct_burst", name: "100 people, one agent", story: "One agent provider submits one valid claim for each of 100 different people within five seconds. A separate person, signed in themselves, submits their own claim in the middle of it." },
  { id: "poll_flood", name: "Status-poll flood", story: "One person’s claim is accepted. A hundred sub-agents each check its status four times in ten seconds. Twenty other people are claiming and checking through the same agent, and one person is signed in themselves." },
  {
    id: "heavy_person", name: "One person, many items", story: "One person submits 40 different, valid items at once while 40 other people submit one each, through the same agent. A separate signed-in person submits one.",
    hypothetical: "HMRC’s claim route caps one person at 3 open claims (a provisional demo rule), so this cannot happen there. It stands for a service where one person may legitimately have many items waiting.",
  },
];

export type Policy = { id: PolicyId; name: string; what: string; agentLimit?: number; person?: boolean; discipline: Discipline; builtInHmrc: boolean };
export const POLICIES: Policy[] = [
  { id: "none", name: "No controls", what: "Everything is admitted; the queue is first in, first out. The baseline.", discipline: "fifo", builtInHmrc: false },
  { id: "agent_60", name: "Agent-level throttle, 60 a minute", what: "Each agent provider may send 60 requests a minute across everyone it acts for.", agentLimit: 60, discipline: "fifo", builtInHmrc: false },
  { id: "agent_600", name: "Agent-level throttle, 600 a minute", what: "The same, ten times as generous.", agentLimit: 600, discipline: "fifo", builtInHmrc: false },
  { id: "person_throttle", name: "Person-level technical throttle", what: "Each person’s traffic is limited, however many agents or sessions send it: 60 writes and 300 reads a minute (HMRC’s defaults).", person: true, discipline: "fifo", builtInHmrc: true },
  { id: "fair_person", name: "Fair scheduling by person", what: "Nothing is turned away. The queue serves whoever was served least recently, so one person with many items takes one turn per round.", discipline: "person", builtInHmrc: true },
  { id: "fair_provider", name: "Fair scheduling by agent provider", what: "As above, but fair between providers first and between their people second. An alternative HMRC has not built.", discipline: "provider", builtInHmrc: false },
  { id: "as_built", name: "HMRC as built", what: "The person-level throttle and the fair-by-person queue together, as in issues #20 and #21.", person: true, discipline: "person", builtInHmrc: true },
];

// ── Deterministic randomness: every draw is a hash of the seed and a label, so it never depends on the order events
// happen in, and the same label gives the same draw under every policy.
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry(a: number) {
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const draw = (seed: number, label: string) => mulberry(hash(`${seed}:${label}`))();

// ── Workload.
type Person = { id: string; operator: string; viaAgent: boolean; role: "victim" | "light" | "heavy" | "bystander" };
type Req = { at: number; type: "claim" | "poll"; person: string; intent: string; key: string; legit: boolean; attempt: number; target?: string };
type Workload = { people: Person[]; reqs: Req[]; intents: Map<string, { person: string }> };

const AGENT = "agent-provider-1";
function build(id: WorkloadId, seed: number): Workload {
  const people: Person[] = [];
  const reqs: Req[] = [];
  const intents = new Map<string, { person: string }>();
  const u = (l: string) => draw(seed, `${id}:${l}`);
  const addPerson = (p: Person) => people.push(p);
  const claim = (p: Person, intent: string, at: number, key = `${intent}:k0`, legit = true) => {
    if (legit) intents.set(intent, { person: p.id });
    reqs.push({ at, type: "claim", person: p.id, intent, key, legit, attempt: 0 });
  };
  const light = (n: number, over: number, prefix = "light") => {
    for (let i = 0; i < n; i++) {
      const p: Person = { id: `${prefix}-${i}`, operator: AGENT, viaAgent: true, role: "light" };
      addPerson(p);
      claim(p, `${p.id}#0`, u(`${p.id}`) * over);
    }
  };
  const bystander = (at: number) => {
    const p: Person = { id: "bystander", operator: "own-session", viaAgent: false, role: "bystander" };
    addPerson(p);
    claim(p, "bystander#0", at);
  };

  if (id === "retry_storm") {
    const v: Person = { id: "victim", operator: AGENT, viaAgent: true, role: "victim" };
    addPerson(v);
    claim(v, "victim#0", 0, "victim:K");
    for (let i = 0; i < 100; i++) reqs.push({ at: u(`retry-${i}`) * 3, type: "claim", person: v.id, intent: "victim#0", key: "victim:K", legit: false, attempt: 0 });
    light(20, 20);
  } else if (id === "distinct_burst") {
    light(100, 5);
    bystander(2.5);
  } else if (id === "poll_flood") {
    const v: Person = { id: "victim", operator: AGENT, viaAgent: true, role: "victim" };
    addPerson(v);
    claim(v, "victim#0", 0);
    for (let i = 0; i < 100; i++) for (let k = 0; k < 4; k++) reqs.push({ at: 1 + u(`poll-${i}-${k}`) * 10, type: "poll", person: v.id, intent: "victim#0", key: `flood-${i}-${k}`, legit: false, attempt: 0, target: "victim#0" });
    light(20, 10);
    bystander(2);
  } else {
    const h: Person = { id: "heavy", operator: AGENT, viaAgent: true, role: "heavy" };
    addPerson(h);
    for (let i = 0; i < 40; i++) claim(h, `heavy#${i}`, u(`heavy-${i}`) * 0.5);
    light(40, 5);
    bystander(2.5);
  }
  return { people, reqs, intents };
}

// ── The service.
type Item = { intent: string; person: string; operator: string; receivedAt: number; ms: number; startedAt?: number; completedAt?: number };
type Win = { start: number; count: number };

export type SimMetrics = {
  /** Requests that reached HMRC, retries and polls included. */
  attempts: number;
  /** Delegate checks: every agent request, before any limit. A throttle does not reduce them. */
  authorityChecks: number;
  throttled429: number;
  /** Writes and reads that passed admission and reached the business layer (replays and polls are reads). */
  admittedWrites: number;
  admittedReads: number;
  /** Underlying unique legitimate operations the people wanted. */
  demanded: number;
  /** Of those, received into the queue by the end. */
  received: number;
  /** Of those, recorded by the end. */
  completed: number;
  /** Legitimate operations that gave up after being throttled and never reached the queue. */
  lost: number;
  /** Duplicate requests answered without creating anything. */
  duplicatesAbsorbed: number;
  /** Claims actually created. One per operation received, however many requests carried it (that is held constant, not tested). */
  businessActions: number;
  peakQueue: number;
  /** Seconds from the first request to the last claim recorded. */
  drainS: number | null;
  /** From a person’s first attempt to their claim being recorded, over people with a single claim. */
  lightP50S: number | null;
  lightP95S: number | null;
  /** 1 means everyone with a single claim waited the same; lower means more uneven. */
  lightEvenness: number | null;
  /** The separately signed-in person, if the workload has one. */
  bystanderS: number | null;
  /** The people who were not the cause of the load: their own checks on their own claims. */
  legitPolls: number;
  legitPollsThrottled: number;
  floodPolls: number;
  floodPollsThrottled: number;
};

export type SimRow = { policy: Policy; metrics: SimMetrics };
export type SimResult = { workload: (typeof WORKLOADS)[number]; seed: number; rows: SimRow[] };

const pct = (xs: number[], p: number) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))]; };

export function simulate(workloadId: WorkloadId, policy: Policy, seed = SIM_SEED): SimMetrics {
  const A = ASSUMPTIONS;
  const w = build(workloadId, seed);
  const person = new Map(w.people.map((p) => [p.id, p]));
  const m: SimMetrics = {
    attempts: 0, authorityChecks: 0, throttled429: 0, admittedWrites: 0, admittedReads: 0, demanded: w.intents.size, received: 0, completed: 0, lost: 0,
    duplicatesAbsorbed: 0, businessActions: 0, peakQueue: 0, drainS: null, lightP50S: null, lightP95S: null, lightEvenness: null, bystanderS: null,
    legitPolls: 0, legitPollsThrottled: 0, floodPolls: 0, floodPollsThrottled: 0,
  };

  // Event queue: arrivals, worker completions and legitimate clients' next status checks, in time order.
  type Ev = { at: number; seq: number; kind: "req" | "done"; req?: Req; item?: Item; worker?: number };
  const evs: Ev[] = [];
  let seq = 0;
  const push = (e: Omit<Ev, "seq">) => { evs.push({ ...e, seq: seq++ }); };
  for (const r of w.reqs) push({ at: r.at, kind: "req", req: r });
  const next = () => { let bi = 0; for (let i = 1; i < evs.length; i++) if (evs[i].at < evs[bi].at || (evs[i].at === evs[bi].at && evs[i].seq < evs[bi].seq)) bi = i; return evs.splice(bi, 1)[0]; };

  const windows = new Map<string, Win>();
  const hit = (key: string, limit: number, now: number) => {
    let c = windows.get(key);
    if (!c || now - c.start >= A.windowS) { c = { start: now, count: 0 }; windows.set(key, c); }
    c.count += 1;
    return c.count <= limit ? 0 : Math.max(1, Math.ceil(c.start + A.windowS - now));
  };

  const heldKeys = new Set<string>();         // keys HMRC has an outcome for
  const received = new Map<string, Item>();   // one item per intent: the business action
  const queue: Item[] = [];
  const lastServed = new Map<string, number>();     // person -> last time a worker took one of theirs
  const lastServedProv = new Map<string, number>();
  const free: boolean[] = Array(A.workers).fill(true);
  const firstAttempt = new Map<string, number>();

  const pick = (): Item | undefined => {
    if (!queue.length) return undefined;
    let best = 0;
    const score = (it: Item) => {
      if (policy.discipline === "fifo") return [it.receivedAt, 0];
      const own = lastServed.get(it.person) ?? -1;
      if (policy.discipline === "person") return [own, it.receivedAt];
      return [lastServedProv.get(it.operator) ?? -1, own * 1e-3 + it.receivedAt * 1e-6];
    };
    for (let i = 1; i < queue.length; i++) {
      const a = score(queue[i]), b = score(queue[best]);
      if (a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])) best = i;
    }
    return queue.splice(best, 1)[0];
  };
  const dispatch = (now: number) => {
    for (let wi = 0; wi < free.length; wi++) {
      if (!free[wi]) continue;
      const it = pick();
      if (!it) return;
      free[wi] = false;
      it.startedAt = now;
      lastServed.set(it.person, now);
      lastServedProv.set(it.operator, now);
      push({ at: now + it.ms / 1000, kind: "done", item: it, worker: wi });
    }
  };

  const retry = (r: Req, now: number, wait: number) => {
    if (!r.legit || r.attempt >= A.maxRetries) return false;
    push({ at: now + wait + draw(seed, `${workloadId}:jitter:${r.person}:${r.intent}:${r.type}:${r.attempt}`) * 0.5, kind: "req", req: { ...r, attempt: r.attempt + 1 } });
    return true;
  };

  while (evs.length) {
    const ev = next();
    if (ev.at > A.horizonS) break;
    const now = ev.at;
    if (ev.kind === "done") {
      ev.item!.completedAt = now;
      free[ev.worker!] = true;
      dispatch(now);
      continue;
    }
    const r = ev.req!;
    const p = person.get(r.person)!;
    m.attempts++;
    if (p.viaAgent) m.authorityChecks++;
    if (r.type === "poll") { if (r.legit) m.legitPolls++; else m.floodPolls++; }
    if (r.type === "claim" && r.legit && r.attempt === 0) firstAttempt.set(r.intent, now);
    const isReplay = r.type === "claim" && heldKeys.has(r.key);
    const cost: "write" | "read" = r.type === "claim" && !isReplay ? "write" : "read";

    // Admission, as the policy under test decides it.
    let wait = 0;
    if (policy.agentLimit && p.viaAgent) wait = hit(`agent:${p.operator}`, policy.agentLimit, now);
    if (!wait && policy.person) wait = hit(`person:${p.id}:${cost}`, A.personPerMinute[cost], now);
    if (wait) {
      m.throttled429++;
      if (r.type === "poll") { if (r.legit) m.legitPollsThrottled++; else m.floodPollsThrottled++; }
      retry(r, now, wait);
      continue;
    }

    if (cost === "write") m.admittedWrites++; else m.admittedReads++;
    if (r.type === "claim") {
      heldKeys.add(r.key);
      if (received.has(r.intent)) { m.duplicatesAbsorbed++; continue; }
      const it: Item = { intent: r.intent, person: r.person, operator: p.operator, receivedAt: now, ms: A.serviceMs[0] + draw(seed, `${workloadId}:service:${r.intent}`) * (A.serviceMs[1] - A.serviceMs[0]) };
      received.set(r.intent, it);
      queue.push(it);
      m.peakQueue = Math.max(m.peakQueue, queue.length + free.filter((f) => !f).length);
      dispatch(now);
      // The person's own agent starts checking on it.
      if (r.legit) { push({ at: now + A.pollEveryS, kind: "req", req: { at: 0, type: "poll", person: r.person, intent: r.intent, key: `own-${r.intent}`, legit: true, attempt: 0, target: r.intent } }); }
    } else {
      const target = received.get(r.target!);
      // A legitimate client keeps checking until its claim is recorded.
      if (r.legit && !(target?.completedAt !== undefined && target.completedAt <= now)) {
        push({ at: now + A.pollEveryS, kind: "req", req: { ...r, at: 0, attempt: 0 } });
      }
    }
  }

  // Tally. Recorded means a worker finished it before the horizon.
  const done = [...received.values()].filter((i) => i.completedAt !== undefined);
  m.received = [...w.intents.keys()].filter((k) => received.has(k)).length;
  m.completed = done.length;
  m.businessActions = received.size;
  m.lost = m.demanded - m.received;
  const firstAny = w.reqs.length ? Math.min(...w.reqs.map((r) => r.at)) : 0;
  m.drainS = done.length ? Math.max(...done.map((i) => i.completedAt!)) - firstAny : null;
  const latency = (i: Item) => i.completedAt! - (firstAttempt.get(i.intent) ?? i.receivedAt);
  const lightLat = done.filter((i) => ["light", "bystander", "victim"].includes(person.get(i.person)!.role)).map(latency);
  m.lightP50S = pct(lightLat, 50);
  m.lightP95S = pct(lightLat, 95);
  m.lightEvenness = lightLat.length ? lightLat.reduce((a, b) => a + b, 0) ** 2 / (lightLat.length * lightLat.reduce((a, b) => a + b * b, 0)) : null;
  const by = done.find((i) => i.person === "bystander");
  m.bystanderS = by ? latency(by) : null;
  return m;
}

export function simulateAll(seed = SIM_SEED): SimResult[] {
  return WORKLOADS.map((workload) => ({ workload, seed, rows: POLICIES.map((policy) => ({ policy, metrics: simulate(workload.id, policy, seed) })) }));
}

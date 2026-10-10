import { mkdir, readFile, writeFile, rename, rm, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

export type Agreement = { principalId: string; agentId: string; propertyId: string; grantReference: string; credentialEnv: string; frequency: "daily" | "weekly"; weekday?: number; hour: number; minute: number; timezone: "Europe/London"; startsAt: string; endsAt: string; agreed: true };
export type Outcome = { kind: "completed" | "unchanged" | "pending" | "refused" | "unavailable"; code?: string; providerCalls: number | null; replayed?: boolean; retryAfterSeconds?: number };
export type Execution = { id: string; dueAt: string; attempt: number; state: "running" | "finished"; leaseUntil: string; outcome?: Outcome; retryAt?: string; receipts?: { attempt: number; at: string; outcome: Outcome }[] };
export type Job = { id: string; agreement: Agreement; state: "active" | "paused" | "stopped" | "ended" | "authority-refused"; createdAt: string; executions: Execution[] };
type State = { version: 1; jobs: Job[] };
export type Lookup = (request: { principalId: string; agentId: string; propertyId: string; grantReference: string; credentialEnv: string; idempotencyKey: string }) => Promise<Outcome>;
const MAX_ATTEMPTS = 3;
const LEASE_MS = 120_000;
const iso = (n: number) => new Date(n).toISOString();
function validAgreement(a: Agreement) {
  for (const key of ["principalId", "agentId", "propertyId", "grantReference"] as const) if (typeof a[key] !== "string" || !a[key] || a[key].length > 200) throw new Error(`Invalid ${key}`);
  if (!/^[A-Z][A-Z0-9_]{0,99}$/.test(a.credentialEnv)) throw new Error("Use a credential environment reference, never a secret");
  if (a.agreed !== true || a.timezone !== "Europe/London" || !["daily", "weekly"].includes(a.frequency) || !Number.isInteger(a.hour) || a.hour < 0 || a.hour > 23 || !Number.isInteger(a.minute) || a.minute < 0 || a.minute > 59 || (a.frequency === "weekly" && (!Number.isInteger(a.weekday) || a.weekday! < 0 || a.weekday! > 6))) throw new Error("Invalid schedule agreement");
  const start = Date.parse(a.startsAt), end = Date.parse(a.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 366 * 86400000) throw new Error("An end date within 366 days is required");
}
const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function local(n: number) { const parts = Object.fromEntries(fmt.formatToParts(n).map(p => [p.type, p.value])); return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute), weekday: new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00Z`).getUTCDay() }; }
// Search real UTC minutes: nonexistent spring times are skipped; only the first autumn occurrence is used.
export function latestOccurrence(a: Agreement, now: number): { id: string; dueAt: string } | undefined {
  const floor = Math.ceil(Date.parse(a.startsAt) / 60000) * 60000;
  const ceiling = Math.min(now, Date.parse(a.endsAt) - 1);
  const lower = Math.max(floor, ceiling - 8 * 86400000);
  let result: { id: string; dueAt: string } | undefined;
  for (let t = Math.ceil(lower / 60000) * 60000; t <= ceiling; t += 60000) { const l = local(t); if (l.hour === a.hour && l.minute === a.minute && (a.frequency === "daily" || l.weekday === a.weekday)) { if (!result || result.id !== l.date) result = { id: l.date, dueAt: iso(t) }; } }
  return result;
}

export class FileJobStore {
  readonly path: string;
  constructor(path: string) { this.path = resolve(path); }
  async transaction<T>(fn: (state: State) => T): Promise<T> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const lock = `${this.path}.lock`;
    let acquired = false;
    for (let tries = 0; tries < 100; tries++) {
      try { await mkdir(lock, { mode: 0o700 }); acquired = true; await writeFile(`${lock}/owner`, String(process.pid), { mode: 0o600 }); break; }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
        // Never steal a store lock: a crashed writer requires explicit stopped-worker recovery.
        await new Promise(r => setTimeout(r, 10));
      }
    }
    if (!acquired) throw new Error("Job store busy; no lookup performed");
    try {
      let state: State;
      try { state = JSON.parse(await readFile(this.path, "utf8")); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; state = { version: 1, jobs: [] }; }
      if (state.version !== 1 || !Array.isArray(state.jobs)) throw new Error("Unsupported job store");
      const result = fn(state);
      const temp = `${this.path}.${randomUUID()}.tmp`;
      const handle = await open(temp, "wx", 0o600);
      try { await handle.writeFile(JSON.stringify(state)); await handle.sync(); } finally { await handle.close(); }
      await rename(temp, this.path);
      const directory = await open(dirname(this.path), "r"); try { await directory.sync(); } finally { await directory.close(); }
      return structuredClone(result);
    } finally { await rm(lock, { recursive: true, force: true }); }
  }
  list() { return this.transaction(s => s.jobs); }
}

export class Runner {
  constructor(readonly store: FileJobStore, readonly lookup: Lookup, readonly clock: () => number = Date.now) {}
  create(agreement: Agreement) { validAgreement(agreement); return this.store.transaction(s => { const job: Job = { id: randomUUID(), agreement: { principalId: agreement.principalId, agentId: agreement.agentId, propertyId: agreement.propertyId, grantReference: agreement.grantReference, credentialEnv: agreement.credentialEnv, frequency: agreement.frequency, weekday: agreement.frequency === "weekly" ? agreement.weekday : undefined, hour: agreement.hour, minute: agreement.minute, timezone: agreement.timezone, startsAt: iso(Date.parse(agreement.startsAt)), endsAt: iso(Date.parse(agreement.endsAt)), agreed: true }, state: "active", createdAt: iso(this.clock()), executions: [] }; s.jobs.push(job); return job; }); }
  control(id: string, action: "pause" | "resume" | "stop") { return this.store.transaction(s => { const j = s.jobs.find(j => j.id === id); if (!j) throw new Error("Unknown job"); if (action === "stop") j.state = "stopped"; else if (action === "pause" && j.state === "active") j.state = "paused"; else if (action === "resume" && j.state === "paused") j.state = "active"; else throw new Error("Invalid state transition; create a newly agreed job to change scope"); return j; }); }
  async tick(): Promise<Execution[]> {
    const now = this.clock();
    const claims = await this.store.transaction(s => {
      const claimed: { job: Job; execution: Execution }[] = [];
      for (const job of s.jobs) {
        if (claimed.length) break; // One leased request per tick; no waiting claims expire behind slow calls.
        if (job.state !== "active") continue;
        if (now >= Date.parse(job.agreement.endsAt)) { job.state = "ended"; continue; }
        if (now < Date.parse(job.agreement.startsAt)) continue;
        const pending = job.executions.find(e => e.state === "running" || e.retryAt);
        if (pending) {
          const due = pending.state === "running" ? pending.leaseUntil : pending.retryAt!;
          if (now < Date.parse(due)) continue;
          if (pending.attempt >= MAX_ATTEMPTS) { pending.state = "finished"; pending.retryAt = undefined; pending.outcome = { kind: "unavailable", code: "RETRY_EXHAUSTED", providerCalls: null }; continue; }
          pending.attempt++; pending.state = "running"; pending.retryAt = undefined; pending.leaseUntil = iso(now + LEASE_MS); claimed.push({ job, execution: pending }); continue;
        }
        const occurrence = latestOccurrence(job.agreement, now);
        if (!occurrence || job.executions.some(e => e.id === `${job.id}:${occurrence.id}`)) continue;
        const e: Execution = { id: `${job.id}:${occurrence.id}`, dueAt: occurrence.dueAt, attempt: 1, state: "running", leaseUntil: iso(now + LEASE_MS) };
        job.executions.push(e); claimed.push({ job, execution: e });
      }
      return claimed;
    });
    const results: Execution[] = [];
    // Each call is fresh; this runner never caches an authorisation decision.
    for (const claim of claims) {
      let outcome: Outcome;
      try { outcome = await this.lookup({ ...claim.job.agreement, idempotencyKey: claim.execution.id }); } catch { outcome = { kind: "unavailable", code: "CONNECTOR_UNAVAILABLE", providerCalls: null }; }
      if (!outcome || typeof outcome !== "object" || !["completed", "unchanged", "pending", "refused", "unavailable"].includes(outcome.kind) || (outcome.providerCalls !== null && (!Number.isInteger(outcome.providerCalls) || outcome.providerCalls < 0))) outcome = { kind: "unavailable", code: "INVALID_CONNECTOR_RESPONSE", providerCalls: null };
      results.push(await this.store.transaction(s => {
        const j = s.jobs.find(j => j.id === claim.job.id)!;
        const e = j.executions.find(e => e.id === claim.execution.id)!;
        if (e.attempt !== claim.execution.attempt || e.state !== "running") return e;
        e.state = "finished"; e.outcome = { kind: outcome.kind, providerCalls: outcome.providerCalls, replayed: outcome.replayed === true, retryAfterSeconds: Number.isFinite(outcome.retryAfterSeconds) ? outcome.retryAfterSeconds : undefined, code: outcome.code?.replace(/[^A-Z0-9_]/g, "").slice(0, 80) };
        (e.receipts ||= []).push({ attempt: e.attempt, at: iso(this.clock()), outcome: e.outcome });
        if (outcome.kind === "refused" && j.state === "active") j.state = "authority-refused";
        if (["unavailable", "pending"].includes(outcome.kind) && e.attempt < MAX_ATTEMPTS) e.retryAt = iso(this.clock() + Math.min(3600, Math.max(60, outcome.retryAfterSeconds || 60 * e.attempt)) * 1000);
        return e;
      }));
    }
    return results;
  }
}

export function metrics(job: Job) {
  const receipts = job.executions.flatMap(e => e.receipts || []);
  const attempts = job.executions.reduce((n, e) => n + e.attempt, 0);
  return {
    occurrences: job.executions.length, attempts, observedAttempts: receipts.length,
    completed: receipts.filter(r => r.outcome.kind === "completed" && !r.outcome.replayed).length,
    unchanged: receipts.filter(r => r.outcome.kind === "unchanged" && !r.outcome.replayed).length,
    replayed: receipts.filter(r => r.outcome.replayed).length,
    refused: receipts.filter(r => r.outcome.kind === "refused").length,
    providerCalls: receipts.reduce((n, r) => n + (r.outcome.providerCalls || 0), 0),
    // Missing receipts (for example a crashed request) also leave upstream work unknown.
    providerCallsUnknown: attempts - receipts.length + receipts.filter(r => r.outcome.providerCalls === null).length,
  };
}

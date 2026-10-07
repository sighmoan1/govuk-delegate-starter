// The task runner: what Example AI does, step by step. It is scripted; the
// point of the demo is that whatever the agent tries, HMRC asks Delegate.
import type { Run, StepOutcome } from "@/generated/prisma";
import { prisma } from "./db";
import { config } from "./config";
import { callHmrc, fetchHmrcPage, HMRC_ACTIONS, readRequest, requestAuthority, signInToDelegate } from "./gov";

export const TASK = {
  id: "wfh-relief",
  title: "Claim working-from-home tax relief for Sam",
  needs: ["view_tax_code", "claim_job_expenses"],
  asks: ["view_tax_code", "claim_job_expenses", "update_employment"],
};

const label = (c: string) => HMRC_ACTIONS[c]?.label ?? c;
const lower = (c: string) => label(c).replace(/^./, (x) => x.toLowerCase());
const list = (cs: string[]) => cs.map(lower).join(", ");

async function step(run: Run, title: string, text: string, outcome: StepOutcome, exchange?: unknown) {
  const n = (await prisma.step.count({ where: { runId: run.id } })) + 1;
  return prisma.step.create({ data: { runId: run.id, n, title, text, outcome, exchange: exchange === undefined ? undefined : (exchange as object) } });
}

export const loadRun = (id: string) => prisma.run.findUnique({ where: { id }, include: { steps: { orderBy: { n: "asc" } } } });

/** Start the task. If the agent already knows the person (a re-run), it goes straight to acting. */
export async function startRun(knownPrincipalId: string | null, knownGranted: string[] = []) {
  const run = await prisma.run.create({ data: { persona: "AGENT", task: TASK.id, principalId: knownPrincipalId, granted: knownGranted } });
  const signin = await signInToDelegate();
  if (!signin.token) {
    await step(run, "Sign in to GOV.UK Delegate", "Delegate did not accept Example AI’s credentials.", "REFUSED", signin.exchange);
    return prisma.run.update({ where: { id: run.id }, data: { status: "DONE" } });
  }
  await step(run, "Sign in to GOV.UK Delegate as Example AI", "Example AI proves who it is with its own client credentials. This is the agent’s identity, not Sam’s.", "OK", signin.exchange);

  if (!run.principalId) {
    const ask = await requestAuthority(signin.token, TASK.asks, `${config.appUrl}/callback?run=${run.id}`);
    if (!ask.requestId || !ask.consentUrl) {
      await step(run, "Ask Sam for permission", "Delegate refused the request.", "REFUSED", ask.exchange);
      return prisma.run.update({ where: { id: run.id }, data: { status: "DONE" } });
    }
    await step(run, "Ask Sam for permission through GOV.UK Delegate", `The task needs: ${list(TASK.needs)}. Example AI asks for ${list(TASK.asks)}. Sam decides on GOV.UK, and Example AI waits.`, "WAITING", { ...ask.exchange, consent_url: ask.consentUrl });
    return prisma.run.update({ where: { id: run.id }, data: { status: "WAITING_FOR_PERSON", pendingRequestId: ask.requestId } });
  }
  await step(run, "Permission already held", `Sam previously allowed: ${list(run.granted)}. Example AI does not know whether that still stands; HMRC will check with Delegate.`, "INFO");
  await act(run.id, signin.token, TASK.needs);
  return prisma.run.update({ where: { id: run.id }, data: { status: "DONE" } });
}

/** Sam has come back from GOV.UK. Ask Delegate what happened; never trust the URL. */
export async function resumeRun(runId: string, requestId: string) {
  const run = await loadRun(runId);
  if (!run || run.pendingRequestId !== requestId) return run;
  const signin = await signInToDelegate();
  if (!signin.token) return run;
  const seen = await readRequest(signin.token, requestId);
  if (seen.status === "PENDING" || !seen.status) return run;

  if (seen.status !== "APPROVED" || !seen.principalId) {
    await step(run, "Sam did not give permission", "Example AI will not act for Sam with HMRC.", "REFUSED", seen.exchange);
    return prisma.run.update({ where: { id: run.id }, data: { status: "DONE", pendingRequestId: null } });
  }
  const notGranted = TASK.asks.filter((c) => !seen.granted.includes(c));
  await step(run, "Sam gave permission on GOV.UK", `Allowed: ${list(seen.granted)}.${notGranted.length ? ` Not allowed: ${list(notGranted)}.` : ""} Example AI learns only an opaque id for Sam, not who Sam is.`, "OK", seen.exchange);
  const updated = await prisma.run.update({ where: { id: run.id }, data: { principalId: seen.principalId, granted: seen.granted, pendingRequestId: null } });
  await act(updated.id, signin.token, TASK.needs);
  return prisma.run.update({ where: { id: run.id }, data: { status: "DONE" } });
}

const explain = (cap: string, allowed: boolean, reason: string | null, result: Record<string, unknown> | null) => {
  if (allowed) {
    if (cap === "view_tax_code") return `HMRC says Sam’s tax code is ${result?.tax_code} (${result?.tax_year}).`;
    if (cap === "claim_job_expenses") return `HMRC accepted the claim: ${result?.relief}. New tax code ${result?.new_tax_code}, reference ${result?.claim_reference}.`;
    return `HMRC accepted the request to ${lower(cap)}.`;
  }
  switch (reason) {
    case "PERMISSION_MISSING": return `HMRC refused: Sam did not allow Example AI to ${lower(cap)}. Delegate was asked, and said no.`;
    case "AUTHORISATION_REVOKED": return "HMRC refused: Sam has removed Example AI’s access on GOV.UK.";
    case "AUTHORISATION_EXPIRED": return "HMRC refused: the permission has run out.";
    case "NO_AUTHORISATION": return "HMRC refused: Example AI has no permission from this person.";
    default: return `HMRC refused (${reason ?? "no reason given"}).`;
  }
};

/** Try one or more actions with HMRC as the agent. Each call is a step; HMRC decides. */
export async function act(runId: string, token: string | null, capabilities: string[]) {
  const run = await loadRun(runId);
  if (!run?.principalId) return;
  const t = token ?? (await signInToDelegate()).token;
  if (!t) return;
  for (const cap of capabilities) {
    const r = await callHmrc(cap, { token: t, principalId: run.principalId }, cap === "update_employment" ? { details: "Started working from home (demo)" } : {});
    await step(run, `HMRC: ${label(cap)}`, explain(cap, r.allowed, r.reason, r.result), r.allowed ? "OK" : "REFUSED", r.exchange);
    if (!r.allowed) break;
  }
}

/** The same task, by something that will not identify itself. */
export async function runBot() {
  const run = await prisma.run.create({ data: { persona: "BOT", task: TASK.id } });
  await step(run, "No sign-in, no registration", "The bot goes straight to HMRC with no identity, as a scraper would.", "INFO");
  for (let i = 1; i <= 7; i++) {
    const r = await callHmrc("view_tax_code", null);
    const text = r.exchange.status === 429 ? `Throttled: HTTP 429, retry later. The unidentified lane allows 5 requests a minute.` : `HTTP ${r.exchange.status} after ${r.exchange.ms} ms: a plain-text refusal, no data, no structured error. It points to GOV.UK Delegate.`;
    await step(run, `HMRC API, attempt ${i}`, text, "REFUSED", r.exchange);
  }
  for (let i = 1; i <= 7; i++) {
    const p = await fetchHmrcPage("/your-tax");
    const challenged = (p.location ?? "").includes("/challenge");
    await step(run, `HMRC web page, attempt ${i}`, challenged ? "Sent to the challenge page: a person has to confirm they are there before going further." : `Sent to sign in (HTTP ${p.status}).`, challenged ? "REFUSED" : "INFO", p);
  }
  await step(run, "Result", "Nothing achieved. The way through is to register with GOV.UK Delegate and ask the person for permission.", "INFO");
  return prisma.run.update({ where: { id: run.id }, data: { status: "DONE" } });
}

/** Fire many requests at once and tabulate what HMRC did with them. */
export async function flood(persona: "AGENT" | "BOT", n: number, identity: { principalId: string } | null) {
  const token = persona === "AGENT" ? (await signInToDelegate()).token : null;
  const id = persona === "AGENT" && token && identity ? { token, principalId: identity.principalId } : null;
  const started = Date.now();
  const results = await Promise.all(Array.from({ length: n }, () => callHmrc("view_tax_code", id)));
  const counts: Record<string, number> = {};
  for (const r of results) {
    const k = r.allowed ? "200 allowed" : r.exchange.status === 429 ? "429 throttled" : `${r.exchange.status} ${r.reason ?? (typeof r.exchange.response === "string" ? "plain text" : "refused")}`;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  // Median time to an answer: throttled requests are not answers.
  const ms = results.filter((r) => r.exchange.status !== 429).map((r) => r.exchange.ms).sort((a, b) => a - b);
  return prisma.floodResult.create({ data: { persona, n, counts, medianMs: ms[Math.floor(ms.length / 2)] ?? 0, totalMs: Date.now() - started } });
}

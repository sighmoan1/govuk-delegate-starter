import { readFile } from "node:fs/promises";
import { FileJobStore, Runner, type Agreement, type Lookup } from "./index";
import { connectorLookup } from "./http";

type Options = { fetcher?: typeof fetch; clock?: () => number; signal?: AbortSignal; wait?: (milliseconds: number, signal: AbortSignal) => Promise<void> };
function serviceUrl(value: string) { const url = new URL(value); if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) throw new Error("Use HTTPS or loopback services"); if (url.username || url.password) throw new Error("Keep credentials in private environment references"); return url; }
async function wait(milliseconds: number, signal: AbortSignal) { if (signal.aborted) return; await new Promise<void>(resolve => { const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); }; const timer = setTimeout(done, milliseconds); signal.addEventListener("abort", done, { once: true }); }); }

export async function main(args: string[], options: Options = {}) {
  const [command, path, argument, intervalArgument] = args;
  if (!path || !["create", "list", "pause", "resume", "stop", "tick", "run-worker"].includes(command)) throw new Error("Usage: cli <create|list|pause|resume|stop|tick|run-worker> <private-store-path> [agreement-file|job-id|max-ticks] [interval-ms]");
  const store = new FileJobStore(path), fetcher = options.fetcher ?? fetch;
  const connector = serviceUrl(process.env.WHENISBINS_CONNECTOR_URL || "http://127.0.0.1:3310");
  const delegate = serviceUrl(process.env.WHENISBINS_DELEGATE_URL || process.env.DELEGATE_URL || "http://localhost:3300");
  const verifyMode = async () => { const response = await fetcher(new URL("/health", connector), { redirect: "error", signal: AbortSignal.timeout(5000) }); if (!response.ok) throw new Error("Connector health unavailable"); const health = await response.json(); if (health.mode !== "fixture" && !(health.mode === "live" && process.env.WHENISBINS_RUNNER_ALLOW_LIVE === "true")) throw new Error("Live/unknown provider mode requires explicit configuration"); };
  const lookup: Lookup = async request => {
    await verifyMode();
    try { return await connectorLookup(connector.href, async reference => {
      const secret = process.env[reference]; if (!secret) throw new Error("Agent client secret unavailable");
      const response = await fetcher(new URL("/api/agent/token", delegate), { method: "POST", redirect: "error", signal: AbortSignal.timeout(5000), headers: { "content-type": "application/json" }, body: JSON.stringify({ client_id: process.env.WHENISBINS_AGENT_CLIENT_ID || process.env.DEMO_AGENT_CLIENT_ID || "demo-personal-agent", client_secret: secret }) });
      if (!response.ok) throw new Error("Agent token unavailable");
      const token = await response.json(); if (typeof token.access_token !== "string") throw new Error("Invalid agent token response");
      if (token.delegate_id !== request.agentId) throw new Error("AGENT_IDENTITY_MISMATCH");
      return token.access_token;
    }, fetcher)(request); } catch (error) { if (error instanceof Error && error.message === "AGENT_IDENTITY_MISMATCH") return { kind: "refused", code: "AGENT_IDENTITY_MISMATCH", providerCalls: 0 }; throw error; }
  };
  const runner = new Runner(store, lookup, options.clock ?? Date.now);
  if (command === "create") { if (!argument) throw new Error("Agreement file required"); return runner.create(JSON.parse(await readFile(argument, "utf8")) as Agreement); }
  if (command === "list") return store.list();
  if (command === "tick") { await verifyMode(); return runner.tick(); }
  if (command === "run-worker") {
    const maxTicks = Number(argument ?? 10080), interval = Number(intervalArgument ?? 60000);
    if (!Number.isInteger(maxTicks) || maxTicks < 1 || maxTicks > 10080 || !Number.isInteger(interval) || interval < 1000 || interval > 3600000) throw new Error("Use 1–10080 ticks and a 1-second–1-hour interval");
    await verifyMode();
    const controller = new AbortController(), stop = () => controller.abort();
    if (options.signal?.aborted) stop(); else options.signal?.addEventListener("abort", stop, { once: true });
    process.once("SIGTERM", stop); process.once("SIGINT", stop);
    let ticks = 0, executions = 0;
    try {
      while (!controller.signal.aborted && ticks < maxTicks) {
        if (!(await store.list()).some(job => job.state === "active")) break;
        executions += (await runner.tick()).length; ticks++;
        if (ticks < maxTicks && !controller.signal.aborted) await (options.wait ?? wait)(interval, controller.signal);
      }
      return { ticks, executions, stopped: controller.signal.aborted, state_retained: true, live_provider_opt_in: process.env.WHENISBINS_RUNNER_ALLOW_LIVE === "true" };
    } finally { process.removeListener("SIGTERM", stop); process.removeListener("SIGINT", stop); options.signal?.removeEventListener("abort", stop); }
  }
  if (!argument) throw new Error("Job id required");
  return runner.control(argument, command as "pause" | "resume" | "stop");
}
if (process.argv[1]?.endsWith("cli.ts")) main(process.argv.slice(2)).then(result => console.log(JSON.stringify(result))).catch(() => { console.error("Runner command failed; check the agreement, private store, mode and agent client configuration."); process.exitCode = 1; });

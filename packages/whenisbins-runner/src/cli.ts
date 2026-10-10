import { readFile } from "node:fs/promises";
import { FileJobStore, Runner, type Agreement } from "./index";
import { connectorLookup } from "./http";
export async function main(args: string[]) {
  const [command, path, argument] = args;
  if (!path || !["create", "list", "pause", "resume", "stop", "tick"].includes(command)) throw new Error("Usage: cli <create|list|pause|resume|stop|tick> <private-store-path> [agreement-file|job-id]");
  const store = new FileJobStore(path);
  const lookup = connectorLookup(process.env.WHENISBINS_CONNECTOR_URL || "http://127.0.0.1:3307", async reference => { const token = process.env[reference]; if (!token) throw new Error("Agent credential unavailable"); return token; });
  const runner = new Runner(store, lookup);
  if (command === "create") { if (!argument) throw new Error("Agreement file required"); return runner.create(JSON.parse(await readFile(argument, "utf8")) as Agreement); }
  if (command === "list") return store.list();
  if (command === "tick") return runner.tick();
  if (!argument) throw new Error("Job id required");
  return runner.control(argument, command as "pause" | "resume" | "stop");
}
if (process.argv[1]?.endsWith("cli.ts")) main(process.argv.slice(2)).then(result => console.log(JSON.stringify(result))).catch(() => { console.error("Runner command failed; check the agreement, private store and connector configuration."); process.exitCode = 1; });

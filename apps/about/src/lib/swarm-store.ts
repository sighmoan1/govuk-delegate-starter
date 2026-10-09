import type { SwarmRun } from "./swarm";

// The last few runs, kept in memory so the results page can be loaded by a short link. A full run is far too big
// for a URL. The about site has no database; a restart forgets them, and the page says so and offers a new run.
const KEEP = 8;
const g = globalThis as unknown as { __swarmRuns?: Map<string, SwarmRun> };
const runs = (g.__swarmRuns ??= new Map());

export function saveRun(run: SwarmRun): string {
  runs.set(run.runId, run);
  while (runs.size > KEEP) runs.delete(runs.keys().next().value as string);
  return run.runId;
}
export const loadRun = (id: string | undefined) => (id ? runs.get(id) ?? null : null);

import { WhenIsBinsEvent, type WhenIsBinsResearchEvent } from "@prototype/research-feed";

export function whenisbinsEvidence(snapshots: unknown[]) {
  const unique = new Map<string, WhenIsBinsResearchEvent>();
  for (const snapshot of snapshots) {
    const event = WhenIsBinsEvent.parse(snapshot);
    unique.set(event.source_event_id, event);
  }
  const events = [...unique.values()];
  const ids = (field: "task_id" | "occurrence_id" | "outbound_call_id" | "effect_id") => new Set(events.flatMap(e => e.whenisbins[field].value ? [e.whenisbins[field].value!] : [])).size;
  return { source: "whenisbins_connector", schema_version: 2, window: "latest_500_source_events",
    counts: { source_events: events.length, observed_task_ids: ids("task_id"), observed_occurrence_ids: ids("occurrence_id"),
      observed_outbound_call_ids: ids("outbound_call_id"), observed_effect_ids: ids("effect_id") },
    stages: Object.fromEntries([...new Set(events.map(e => e.whenisbins.stage))].map(stage => [stage, events.filter(e => e.whenisbins.stage === stage).length])),
    events, limitations: "Connector observations only. Missing IDs reduce these counts. Stages are source reports, not independently verified effects or delivered emails. No observations of Tom's other visitors, council work/cost or upstream browser fingerprints. Execution truth is held separately in the evaluation ledger." };
}

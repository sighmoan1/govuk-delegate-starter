import type { ResearchEvent } from "@prototype/research-feed";
export type DashboardEvent = { id: string; receivedAt: string; event: ResearchEvent; binding: { runId: string; effectClass: string; operationId: string | null } | null; truth?: { status: string; executionClass: string | null; provenance: unknown; protocolVersion: string; sourceCommit: string; seed: string } };
export function summarise(rows: DashboardEvent[]) {
 const requests = rows.filter(r => r.event.event_kind === "service_request");
 return { hmrc: rows.filter(r=>r.event.source_service==='hmrc').length, delegate: rows.filter(r=>r.event.source_service==='delegate').length,
 operations: new Set(requests.filter(r=>r.binding?.effectClass==='UNIQUE_OPERATION').map(r=>r.binding!.operationId)).size,
 replays: requests.filter(r=>r.binding?.effectClass==='REPLAY').length,
 declared: requests.filter(r=>['AUTHORISED_AGENT','DECLARED_AGENT'].includes(r.event.observed.lane)).length,
 unknown: requests.filter(r=>['UNTRUSTED','UNKNOWN'].includes(r.event.observed.lane)).length,
 identified: rows.filter(r=>r.event.event_kind==='browser_sensor' && r.event.browser_sensor.status==='identified').length,
 sensorNotRun: rows.filter(r=>r.event.event_kind==='browser_sensor' && r.event.browser_sensor.status==='not_run').length,
 sensorMissing: rows.filter(r=>r.event.event_kind==='browser_sensor' && r.event.browser_sensor.status==='missing').length,
 sensorBlocked: rows.filter(r=>r.event.event_kind==='browser_sensor' && r.event.browser_sensor.status==='blocked').length,
 sensorError: rows.filter(r=>r.event.event_kind==='browser_sensor' && r.event.browser_sensor.status==='error').length,
 unidentified: rows.filter(r=>r.event.event_kind==='browser_sensor' && r.event.browser_sensor.status!=='identified').length,
 verified: rows.filter(r=>r.event.event_kind==='browser_sensor' && r.event.browser_sensor.provenance==='vendor_verified').length };
}

export function correlatedSensors(row: DashboardEvent, rows: DashboardEvent[]) {
 const session=row.event.correlation.session_id.value;
 if(!session)return [];
 return rows.filter(r=>r.event.source_service===row.event.source_service && r.event.event_kind==='browser_sensor' && r.event.correlation.session_id.value===session);
}
export function sensorLabel(status: string) { return ({not_run:'Not run; configuration not observed',missing:'Not observed',blocked:'Blocked',error:'Error',identified:'Identified'} as Record<string,string>)[status]??status; }

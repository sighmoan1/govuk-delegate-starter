import { expect, it } from 'vitest';
import { Event, missing } from '../src/index';
const event = () => ({ schema_version: 3, source_service: 'hmrc', source_event_id: 'sensor:fixture', event_kind: 'browser_sensor', occurred_at: { value: '2026-10-14T00:00:00.000Z', status: 'known', provenance: 'source_clock' }, run_id: missing(), correlation: { request_id: missing(), transaction_id: missing(), session_id: missing(), delegate_check_id: missing() }, observed: { lane: 'UNKNOWN', signature_verified: missing(), latency_ms: missing() }, outcome: { decision: 'OBSERVED', outcome_class: missing(), cost_class: missing() }, browser_sensor: { status: 'not_run', provenance: 'not_collected' }, auxiliary_sensor: { botd: { status: 'observed', value: false, provenance: 'client_claim', version: '2.0.0' }, http: { sample_requests_in_window: 1, window_seconds: 60, counter_scope: 'process_local_study_sample_posts', sec_fetch_same_origin: null, provenance: 'server_observed_headers_and_counter' }, smart_signals: { status: 'not_requested', reason: 'PAID_ENTITLEMENT_NOT_VALIDATED' } } });
it('version-3 observations preserve sensor/client provenance and reject truth injection', () => {
  expect(Event.parse(event()).schema_version).toBe(3);
  expect(Event.safeParse({ ...event(), execution_class: 'HUMAN_OPERATED' }).success).toBe(false);
  const injected = event(); Object.assign(injected.auxiliary_sensor.botd, { raw_components: ['private-device'] });
  expect(Event.safeParse(injected).success).toBe(false);
  const inconsistent = event(); inconsistent.auxiliary_sensor.botd.status = 'error';
  expect(Event.safeParse(inconsistent).success).toBe(false);
});

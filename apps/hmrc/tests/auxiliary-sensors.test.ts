import { expect, it } from 'vitest';
import { botdSample, studyHttpEvidence } from '../src/lib/auxiliary-sensors';
it('rejects labels/raw components and distinguishes absence from a negative flag', () => {
  expect(botdSample({ status: 'observed', value: false })).toEqual({ status: 'observed', value: false });
  expect(botdSample({ status: 'not_run', value: false })).toBeNull();
  expect(botdSample({ status: 'observed', value: true, execution_class: 'AI_AGENT_BROWSER' })).toBeNull();
  expect(botdSample({ status: 'error', value: null })).toEqual({ status: 'error', value: null });
});
it('counts only study sample posts in a bounded process-local window', () => {
  const req = new Request('http://local', { headers: { 'sec-fetch-site': 'same-origin', 'user-agent': 'secret raw agent string' } });
  expect(studyHttpEvidence(req, 'fixture-session', 1000).sample_requests_in_window).toBe(1);
  const result = studyHttpEvidence(req, 'fixture-session', 2000);
  expect(result.sample_requests_in_window).toBe(2); expect(result.sec_fetch_same_origin).toBe(true);
  expect(JSON.stringify(result)).not.toContain('secret raw');
  expect(studyHttpEvidence(req, 'fixture-session', 62000).sample_requests_in_window).toBe(1);
  expect(studyHttpEvidence(new Request('http://local'), 'other-fixture', 62000).sec_fetch_same_origin).toBeNull();
});

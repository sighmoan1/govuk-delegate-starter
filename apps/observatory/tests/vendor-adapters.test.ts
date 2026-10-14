import { expect, it, vi } from 'vitest';
import { classifyFrozen, experiment, type EvidenceRecord } from '../src/lib/classification';
import { vendorAdapter, VENDOR_PROMPT, type VendorSettings } from '../src/lib/vendor-adapters';
const settings: VendorSettings = { enabled: true, key: 'synthetic-test-key', model: 'pinned-model', dailyCalls: 10, dailyMicroUsd: 100000, reservationMicroUsd: 10000, minIntervalMs: 1000 };
const record = (): EvidenceRecord => ({ schema: 'observatory-evidence/1', source: 'hmrc', source_event_id: 'protected-label-in-reference', collection_method: 'fixture', observed_at: '2026-10-14T00:00:00Z', sensor: { identifier: 'fixture', version: '1', config: {} }, refs: { session: 'private-session', transaction: null }, sensitivity: 'synthetic_pseudonymous', signals: { signature_verified: { value: true, missingness: 'observed', provenance: 'AI_AGENT_BROWSER', confidence: .9 }, latency_ms: { value: 10, missingness: 'observed', provenance: 'source_record', confidence: null }, browser_present: { value: null, missingness: 'not_observed', provenance: 'not_recorded', confidence: null }, vendor_verified: { value: null, missingness: 'not_observed', provenance: 'not_recorded', confidence: null } } });
it('blinds both official request formats and validates typed answers', async () => {
  for (const provider of ['jev', 'openai-decisions'] as const) {
    const transport = vi.fn().mockResolvedValue(Response.json({ model: 'pinned-model', answers: provider === 'jev' ? { ai_directed: { type: 'noul', noul: .7 } } : [{ type: 'predicate', name: 'ai_directed', probability: .7 }] }));
    const adapter = vendorAdapter(provider, settings, async () => true, transport);
    const config = experiment(adapter); config.prompt = VENDOR_PROMPT;
    const result = await classifyFrozen(record(), config, adapter);
    expect(result.class).toBe('AI_DIRECTED'); expect(result.score).toBe(.7);
    const body = transport.mock.calls[0][1].body;
    expect(body).not.toContain('AI_AGENT_BROWSER'); expect(body).not.toContain('private-session'); expect(body).not.toContain('protected-label'); expect(body).not.toContain('confidence');
  }
});
it('missing keys, budget denial, refusal and changed schemas do not invent negatives', async () => {
  const transport = vi.fn().mockResolvedValue(Response.json({ model: 'pinned-model', answers: [{ type: 'refusal', name: 'ai_directed' }] }));
  const run = async (s: VendorSettings, reserve = async () => true) => {
    const a = vendorAdapter('openai-decisions', s, reserve, transport); const c = experiment(a); c.prompt = VENDOR_PROMPT; return classifyFrozen(record(), c, a);
  };
  expect((await run({ ...settings, key: undefined })).reason).toBe('DETECTOR_NOT_CONFIGURED'); expect(transport).not.toHaveBeenCalled();
  expect((await run(settings, async () => false)).reason).toBe('DETECTOR_BUDGET_OR_RATE_LIMIT'); expect(transport).not.toHaveBeenCalled();
  expect((await run(settings)).reason).toBe('DETECTOR_REFUSED');
  transport.mockResolvedValue(Response.json({ model: 'pinned-model', answers: [{ type: 'predicate', name: 'ai_directed', probability: 5 }] }));
  expect((await run(settings)).reason).toBe('DETECTOR_SCHEMA_CHANGED');
  transport.mockRejectedValue(new Error('synthetic-test-key raw payload'));
  const failed = await run(settings); expect(failed.reason).toBe('DETECTOR_REQUEST_FAILED'); expect(JSON.stringify(failed)).not.toContain('synthetic-test-key');
});

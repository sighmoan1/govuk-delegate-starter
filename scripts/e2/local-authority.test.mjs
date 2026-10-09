import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalAuthority } from './local-authority.mjs';

async function fixture(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'e2-')); const file = join(dir, 'authority.db');
  const a = new LocalAuthority(file, { serviceKey: 'synthetic-service-key' });
  try { await fn(a, file); } finally { await a.close(); rmSync(dir, { recursive: true }); }
}
test('registered identity alone is not citizen authority; narrowed scope, service, person and revocation enforced', () => fixture(async a => {
  const agent = a.registerAgent(); const input = { agent_token: agent.token, principal_id: 'person', service: a.service, capability: 'claim_job_expenses' };
  assert.equal(a.check(input).authorised, false);
  const grant = a.approve({ principal: 'person', subject: 'urn:synthetic:person', agent: agent.id, capabilities: ['claim_job_expenses'] });
  assert.equal(a.check(input).subject, 'urn:synthetic:person');
  for (const change of [{ principal_id: 'other' }, { service: 'other-service' }, { capability: 'change_refund_account' }, { agent_token: 'forged' }]) assert.equal(a.check({ ...input, ...change }).authorised, false);
  assert.throws(() => a.revoke(grant, 'other'));
  a.revoke(grant, 'person'); assert.equal(a.check(input).reason, 'AUTHORISATION_REVOKED');
  assert.equal(a.logs().filter(e => e.kind === 'authority_check').length, 7);
  assert.equal(JSON.stringify(a.logs()).includes(agent.token), false);
}));
test('expired credentials and grants fail; consequential capabilities cannot be enabled without step-up', () => fixture(async a => {
  const expired = a.registerAgent(-1); const agent = a.registerAgent();
  assert.equal(a.check({ agent_token: expired.token }).authorised, false);
  assert.throws(() => a.approve({ principal: 'p', subject: 's', agent: agent.id, capabilities: ['change_address'] }));
  a.approve({ principal: 'p', subject: 's', agent: agent.id, capabilities: ['view_claim_status'], expires: Date.now() - 1 });
  assert.equal(a.check({ agent_token: agent.token, principal_id: 'p', service: a.service, capability: 'view_claim_status' }).reason, 'AUTHORISATION_EXPIRED');
}));
test('durable grant, revocation and receipt persistence; retries converge and changed receipt conflicts', () => fixture(async (a, file) => {
  const agent = a.registerAgent(); const grant = a.approve({ principal: 'p', subject: 's', agent: agent.id, capabilities: ['respond_to_query'] });
  const receipt = { service: a.service, mandate_id: grant, delegation_id: grant, agent_confirmed: true, idempotency_key: 'query:1', text: 'Synthetic answer' };
  const first = a.handle('/api/receipts', receipt); assert.deepEqual(a.handle('/api/receipts', receipt), first);
  assert.throws(() => a.handle('/api/receipts', { ...receipt, text: 'different' }));
  assert.throws(() => a.handle('/api/receipts/status', { service: a.service, ids: ['unknown'] }));
  const b = new LocalAuthority(file, { serviceKey: a.serviceKey });
  try { assert.equal(b.check({ agent_token: agent.token, principal_id: 'p', service: a.service, capability: 'respond_to_query' }).authorised, true); a.revoke(grant, 'p'); assert.equal(b.check({ agent_token: agent.token, principal_id: 'p', service: a.service, capability: 'respond_to_query' }).authorised, false); } finally { await b.close(); }
}));
test('HTTP adapter authenticates HMRC independently and rejects malformed/unsupported operations', () => fixture(async a => {
  const port = await a.listen(0); const url = `http://127.0.0.1:${port}/api/authorisations/check`;
  assert.equal((await fetch(url, { method: 'POST', body: '{}' })).status, 401);
  const res = await fetch(url, { method: 'POST', headers: { 'x-service-key': a.serviceKey }, body: JSON.stringify({ agent_token: 'unknown' }) });
  assert.equal(res.status, 200); assert.equal((await res.json()).authorised, false);
  assert.equal((await fetch(url, { method: 'POST', headers: { 'x-service-key': a.serviceKey }, body: '{' })).status, 400);
}));

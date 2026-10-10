import { expect, test, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Page, nextCursor } from '@prototype/research-feed';
import { createResearchFeed } from '../src/research.js';
import { MemoryStore, FileStore, type Event } from '../src/store.js';
const env = { RESEARCH_FEED_ENABLED: 'true', RESEARCH_FEED_KEY: 'synthetic-export-key', RESEARCH_PSEUDONYM_KEY: 'synthetic-hmac-key' };
const request = (query='', method='GET') => new Request(`http://connector/api/research/events${query}`, { method, headers: { Authorization: `Bearer ${env.RESEARCH_FEED_KEY}` } });
const event = (extra: Partial<Event> = {}): Event => ({ sourceEventId: randomUUID(), occurredAt: '2026-10-10T00:00:00.000Z', action: 'lookup', stage: 'admitted', decision: 'ALLOW', requestId: randomUUID(), ...extra });
test('disabled, public, missing credentials and missing pseudonym key perform no store read', async () => {
 const store = new MemoryStore(); const read = vi.spyOn(store, 'snapshot');
 for (const config of [{ ...env, PUBLIC_MODE: 'true' }, { ...env, RESEARCH_FEED_ENABLED: 'false' }, { ...env, RESEARCH_FEED_KEY: undefined }, { ...env, RESEARCH_PSEUDONYM_KEY: undefined }]) expect((await createResearchFeed(store, config)(request())).status).toBe(403);
 expect((await createResearchFeed(store, env)(new Request('http://connector/api/research/events'))).status).toBe(403); expect(read).not.toHaveBeenCalled();
});
test('strict projection never exports operations, personal data, tokens, links or injected labels', async () => {
 const store = new MemoryStore(); const internal = { ...event(), authorityVerified: true, email: 'private@example.com', stop_link: 'https://whenisbins.com/stop/secret', access_token: 'raw-secret', execution_class: 'HUMAN_OPERATED' };
 store.state.events.push(internal); store.state.operations['private'] = { owner: 'person', property: 'private-address', digest: 'private', key: 'secret', state: 'done', result: { address: 'Private Street' } };
 const response = await createResearchFeed(store, env)(request()); expect(response.status).toBe(200); const page = Page.parse(await response.json()); const encoded = JSON.stringify(page);
 for (const value of ['private@example.com', 'stop_link', 'raw-secret', 'HUMAN_OPERATED', 'Private Street', internal.requestId]) expect(encoded).not.toContain(value);
 expect(page.events[0].observed.lane).toBe('AUTHORISED_AGENT'); expect(page.events[0].observed.signature_verified.value).toBe(null); expect(page.events[0].browser_sensor.status).toBe('not_run'); expect(response.headers.get('cache-control')).toContain('no-store');
});
test('bounded cursor follows durable arrival order and EOF rescans include late earlier-clock events', async () => {
 const directory = await mkdtemp(join(tmpdir(), 'whenisbins-feed-')); try {
  const path = join(directory, 'state.json'); const first = event({ sourceEventId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }); const second = event({ sourceEventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
  await new FileStore(path).transaction(state => { state.events.push(first, second); });
  const one = Page.parse(await (await createResearchFeed(new FileStore(path), env)(request('?limit=1'))).json()); expect(one.events[0].source_event_id).toBe(first.sourceEventId); expect(one.next_cursor).not.toBe(null);
  const two = Page.parse(await (await createResearchFeed(new FileStore(path), env)(request(`?limit=1&cursor=${encodeURIComponent(one.next_cursor!)}`))).json()); expect(two.events[0].source_event_id).toBe(second.sourceEventId); expect(two.next_cursor).toBe(null);
  const late = event({ occurredAt: '2000-01-01T00:00:00.000Z' }); await new FileStore(path).transaction(state => { state.events.push(late); });
  const scan = Page.parse(await (await createResearchFeed(new FileStore(path), env)(request())).json()); expect(scan.events.map(e => e.source_event_id)).toEqual([first.sourceEventId, second.sourceEventId, late.sourceEventId]); expect(scan.next_cursor).toBe(null);
 } finally { await rm(directory, { recursive: true, force: true }); }
});
test('malformed or wrong-source cursor, invalid limit, absent anchor and writes are refused', async () => {
 const handler = createResearchFeed(new MemoryStore(), env);
 for (const query of ['?cursor=bad', '?limit=0', '?limit=201', '?limit=1.5', `?cursor=${nextCursor('hmrc', 'source-id')}`]) expect((await handler(request(query))).status).toBe(400);
 expect((await handler(request(`?cursor=${nextCursor('whenisbins_connector', randomUUID())}`))).status).toBe(409); expect((await handler(request('', 'POST'))).status).toBe(405); expect((await handler(request('', 'HEAD'))).body).toBe(null);
});
test('store/projection failure is explicit and does not modify operational state', async () => {
 const store = new MemoryStore(); store.state.events.push(event({ stage: 'unknown-stage' })); const before = await store.snapshot(); expect((await createResearchFeed(store, env)(request())).status).toBe(503); expect(await store.snapshot()).toEqual(before);
 vi.spyOn(store, 'snapshot').mockRejectedValue(Error('private database details')); const response = await createResearchFeed(store, env)(request()); expect(response.status).toBe(503); expect(await response.text()).not.toContain('private database details');
});

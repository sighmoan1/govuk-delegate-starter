import { afterEach, describe, expect, it, vi } from 'vitest';
import { patient, transportOf, type Attempt } from '../apps/about/src/lib/swarm';
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
describe('a connection lost after durable acceptance', () => {
  it('retries the same intent and reports the ambiguity without creating another effect', async () => {
    vi.useFakeTimers();
    const stored = new Map<string, string>();
    let calls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const key = new Headers(init?.headers).get('idempotency-key')!;
      if (!stored.has(key)) stored.set(key, 'receipt-one');
      if (++calls === 1) throw new TypeError('connection lost after commit');
      return Response.json({result:{transaction_id:stored.get(key)}}, {status:202,headers:{'idempotent-replayed':'true'}});
    });
    const attempts: Attempt[] = [];
    const pending = patient({delegate:'http://delegate.test',hmrc:'http://hmrc.test',demoKey:'test'},attempts,'claim',{agent:true,headers:{}},'recovery',{key:'same-intent'});
    await vi.runAllTimersAsync();
    expect((await pending).txId).toBe('receipt-one');
    expect(stored.size).toBe(1);
    expect(calls).toBe(2);
    expect(transportOf(attempts)).toMatchObject({attempts:2,retries:1,networkErrors:1,receipts:1,total:{replay:1,failed:1}});
  });
  it('stops after six failed sends and retains every failure in the accounting', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis,'fetch').mockRejectedValue(new TypeError('offline'));
    const attempts: Attempt[] = [];
    const pending = patient({delegate:'http://delegate.test',hmrc:'http://hmrc.test',demoKey:'test'},attempts,'claim',{agent:true,headers:{}},'offline',{key:'same-intent'});
    await vi.runAllTimersAsync();
    expect((await pending).status).toBe(0);
    expect(transportOf(attempts)).toMatchObject({attempts:6,retries:5,networkErrors:6,receipts:0});
  });
});

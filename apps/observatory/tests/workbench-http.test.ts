import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/workbench", () => ({ comparisons: vi.fn(), runComparison: vi.fn() }));
import { comparisons, runComparison } from "@/lib/workbench";
import { GET, POST } from "../src/app/api/evaluation/comparisons/route";
const evaluator = 'evaluation-only-synthetic-fixture-0123456789';
beforeEach(() => { vi.stubEnv('OBSERVATORY_EVALUATION_KEY', evaluator); vi.stubEnv('OBSERVATORY_COLLECTION_KEY', 'collection-only-synthetic-fixture-0123456789'); vi.stubEnv('PUBLIC_MODE', 'false'); vi.clearAllMocks(); });
afterEach(() => vi.unstubAllEnvs());
it('does not reveal evaluation results to monitoring or public mode', async () => {
  expect((await GET(new Request('http://local', { headers: { 'x-collection-key': 'collection-only-synthetic-fixture-0123456789' } }))).status).toBe(401);
  expect(comparisons).not.toHaveBeenCalled();
  vi.stubEnv('PUBLIC_MODE', 'true');
  expect((await POST(new Request('http://local', { method: 'POST', headers: { 'x-evaluation-key': evaluator }, body: '{}' }))).status).toBe(503);
  expect(runComparison).not.toHaveBeenCalled();
});
it('authenticated writes are private and oversized JSON never reaches the runner', async () => {
  vi.mocked(runComparison).mockResolvedValue({ id: 'fixture' } as never);
  const response = await POST(new Request('http://local', { method: 'POST', headers: { 'x-evaluation-key': evaluator }, body: '{}' }));
  expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toContain('no-store');
  vi.clearAllMocks();
  expect((await POST(new Request('http://local', { method: 'POST', headers: { 'x-evaluation-key': evaluator }, body: 'x'.repeat(256001) }))).status).toBe(413);
  expect(runComparison).not.toHaveBeenCalled();
});

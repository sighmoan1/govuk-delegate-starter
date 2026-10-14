export type BotDSample = { status: 'observed' | 'not_run' | 'blocked' | 'error'; value: boolean | null };
export function botdSample(input: unknown): BotDSample | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const v = input as Record<string, unknown>;
  if (Object.keys(v).some(k => !['status', 'value'].includes(k)) || !['observed', 'not_run', 'blocked', 'error'].includes(String(v.status))) return null;
  if (v.status === 'observed' ? typeof v.value !== 'boolean' : v.value !== null) return null;
  return { status: v.status as BotDSample['status'], value: v.value as boolean | null };
}
const counts = new Map<string, { start: number; count: number }>();
export function studyHttpEvidence(req: Request, session: string, now = Date.now()) {
  let state = counts.get(session);
  if (!state || now - state.start >= 60_000) { state = { start: now, count: 0 }; counts.set(session, state); }
  state.count = Math.min(100000, state.count + 1);
  if (counts.size > 1000) counts.delete(counts.keys().next().value!);
  const site = req.headers.get('sec-fetch-site');
  return { sample_requests_in_window: state.count, window_seconds: 60 as const, counter_scope: 'process_local_study_sample_posts' as const, sec_fetch_same_origin: site === null ? null : site === 'same-origin', provenance: 'server_observed_headers_and_counter' as const };
}
